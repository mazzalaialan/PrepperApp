import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import h5wasm from 'h5wasm/node';
import { glmReady } from '../src/lightning/glm.ts';
import { irIndex, kmPerPixel, mergeWindows, observeAt, rainRate, readIrFile, windowFor } from '../src/rain/goesIr.ts';
import { colorFor, createRainMapStore, mapLut, renderRainMap, updateRainMap } from '../src/rain/map.ts';
import { latestIrFile, startOfIrKey, withObservedRain, type IrObserver } from '../src/rain/observer.ts';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import type { RainSource } from '../src/rain/source.ts';
import { readIrPartial } from '../src/satellite/partial.ts';

describe('lluvia estimada con el infrarrojo del GOES-19', () => {
  it('ubica puntos en la grilla del satélite (comparado con el archivo real)', () => {
    assert.deepEqual(irIndex(-34.6, -58.4), { row: 4438, col: 3430 });
    assert.deepEqual(irIndex(-54.8, -68.3), { row: 5103, col: 2909 });
    assert.equal(irIndex(35, 140), null); // Japón: no se ve
    // Hacia el sur los píxeles se estiran (de norte a sur).
    assert.ok(kmPerPixel(-54.8, -68.3).row > kmPerPixel(-34.6, -58.4).row * 1.5);
  });

  it('de temperatura del tope a lluvia (Auto-Estimator)', () => {
    assert.equal(rainRate(285), 0);
    assert.ok(Math.abs(rainRate(235) - 0.96) < 0.05);
    assert.ok(Math.abs(rainRate(220) - 6.69) < 0.1);
    assert.equal(rainRate(195), 72); // con tope
  });

  it('lluvia en el punto y en los anillos de 10, 25 y 50 km', () => {
    const lat = -34.578;
    const lon = -58.63;
    const win = windowFor(lat, lon)!;
    const [r0, r1, c0, c1] = win;
    const width = c1 - c0;
    const scale = 0.06145332;
    const offset = 89.62;
    const raw = new Int16Array((r1 - r0) * width).fill(Math.round((285 - offset) / scale));
    const at = irIndex(lat, lon)!;
    const k = kmPerPixel(lat, lon);
    // Una tormenta fría (210 K) a ~20 km al norte.
    const storm = { row: at.row - Math.round(20 / k.row), col: at.col };
    raw[(storm.row - r0) * width + (storm.col - c0)] = Math.round((210 - offset) / scale);
    const o = observeAt(lat, lon, win, raw, { scale, offset, fill: null })!;
    assert.equal(o.here, 0);
    assert.equal(o.within10, 0);
    assert.ok(o.within25 > 15 && o.within25 === o.within50);
  });

  it('junta en franjas las ventanas de lugares cercanos', () => {
    assert.deepEqual(mergeWindows([[100, 130, 50, 80], [140, 170, 10, 40], [400, 430, 0, 10]]), [[100, 170, 10, 80], [400, 430, 0, 10]]);
  });

  it('busca el archivo más nuevo de la banda 13 del GOES-19', async () => {
    const keys = ['OR_ABI-L2-CMIPF-M6C13_G19_s20263080320211_e_c.nc', 'OR_ABI-L2-CMIPF-M6C13_G19_s20263080330211_e_c.nc', 'OR_ABI-L2-CMIPF-M6C14_G19_s20263080340211_e_c.nc'];
    const fake = (async (url: string) =>
      new Response(url.includes('/03/') ? keys.map((k) => `<Contents><Key>ABI-L2-CMIPF/2026/308/03/${k}</Key><Size>24000000</Size></Contents>`).join('') : '')) as typeof fetch;
    const f = await latestIrFile(new Date('2026-11-04T03:45:00Z'), fake);
    assert.equal(f?.key.includes('s20263080330211'), true);
    assert.equal(new Date(startOfIrKey(f!.key)!).toISOString(), '2026-11-04T03:30:21.000Z');
  });

  it('si el satélite ve lluvia en el lugar, "está lloviendo" aunque el pronóstico diga seco', async () => {
    const forecast: RainSource = { name: 'f', outlooks: async (pts) => pts.map((_, i) => (i === 2 ? { state: 'soon' as const, inMinutes: 30, startsAt: 'x', mm: 2 } : { state: 'dry' as const })) };
    const observer: IrObserver = {
      observe: async () => [{ here: 6.2, within10: 8, within25: 9, within50: 9 }, { here: 0, within10: 3, within25: 3, within50: 3 }, null],
      stats: () => ({ files: 0, bytes: 0 }),
    };
    const out = await withObservedRain(forecast, observer).outlooks([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }]);
    assert.deepEqual(out, [{ state: 'raining', mm: 6.2, observedMmH: 6.2 }, { state: 'dry' }, { state: 'soon', inMinutes: 30, startsAt: 'x', mm: 2 }]);
    // Si el satélite falla, queda el pronóstico.
    const broken: IrObserver = { observe: async () => Promise.reject(new Error('x')), stats: () => ({ files: 0, bytes: 0 }) };
    assert.deepEqual((await withObservedRain(forecast, broken).outlooks([{ lat: 0, lon: 0 }]))[0], { state: 'dry' });
  });

  it('lectura parcial real de ventanas (worker y HTTP Range) sobre un NetCDF de prueba en franjas', async () => {
    await glmReady();
    // Igual que el ABI: franjas de 24 filas a lo ancho, comprimidas.
    const path = join(tmpdir(), `ir-test-${process.pid}.nc`);
    const rows = 240;
    const cols = 300;
    const data = new Int16Array(rows * cols).map((_, i) => (i * 7) % 4000);
    const f = new h5wasm.File(path, 'w');
    const ds = f.create_dataset({ name: 'CMI', data, shape: [rows, cols], dtype: '<h', chunks: [24, cols], compression: 5 });
    ds.create_attribute('scale_factor', 0.06145332, null, '<f');
    ds.create_attribute('add_offset', 89.62, null, '<f');
    f.close();
    const bytes = await readFile(path);
    const server = createServer((req, res) => {
      const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '')!;
      const [start, end] = [Number(m[1]), Math.min(Number(m[2]), bytes.length - 1)];
      res.writeHead(206).end(bytes.subarray(start, end + 1));
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      const { port } = server.address() as AddressInfo;
      const windows: [number, number, number, number][] = [[10, 30, 5, 40], [200, 220, 250, 300]];
      const partial = await readIrPartial(`http://127.0.0.1:${port}/c13.nc`, bytes.length, windows);
      const direct = readIrFile(path, windows);
      assert.deepEqual([...partial.value.windows[0]!], [...direct.windows[0]!]);
      assert.deepEqual([...partial.value.windows[1]!], [...direct.windows[1]!]);
      assert.ok(Math.abs(partial.value.scale - 0.06145332) < 1e-6);
      assert.ok(partial.bytes < bytes.length * 0.6, `bajó ${partial.bytes} de ${bytes.length}`);
    } finally {
      server.close();
      await rm(path, { force: true });
    }
  });

  it('arma la imagen del mapa de lluvia y la sirve, y pedirla despierta la tarea', async () => {
    const { width, height, window } = mapLut();
    assert.equal(width, 720);
    assert.ok(height > 1000);
    // Todo a 285 K salvo una tormenta (205 K) sobre Buenos Aires.
    const [r0, r1, c0, c1] = window;
    const cols = c1 - c0;
    const scale = 0.06145332;
    const offset = 89.62;
    const raw = new Int16Array((r1 - r0) * cols).fill(Math.round((285 - offset) / scale));
    const ba = irIndex(-34.6, -58.4)!;
    for (let r = ba.row - 3; r <= ba.row + 3; r++) for (let c = ba.col - 3; c <= ba.col + 3; c++) raw[(r - r0) * cols + (c - c0)] = Math.round((205 - offset) / scale);
    const store = createRainMapStore();
    const done = await updateRainMap(
      store,
      new Date(),
      async () => ({ key: 'k1', size: 10, at: Date.parse('2026-11-04T03:30:00Z') }),
      async () => ({ value: { windows: [raw], scale, offset, fill: null }, bytes: 123, requests: 1 }),
    );
    assert.deepEqual(done, { bytes: 123 });
    assert.deepEqual([...store.png!.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG');
    const { rainyPixels } = renderRainMap({ windows: [raw], scale, offset, fill: null });
    assert.ok(rainyPixels > 10 && rainyPixels < 400, `${rainyPixels}`);
    assert.deepEqual(colorFor(0.5), null);
    assert.notDeepEqual(colorFor(50), colorFor(1.5));

    let woke = 0;
    const map = await buildApp(loadConfig({}), openDb(':memory:'), { publicKey: 'k', send: async () => true }, false, undefined, undefined, { store, wake: () => woke++ });
    const meta = (await map.inject('/api/rain/map')).json() as { at: string; image: string; bounds: { west: number } };
    assert.equal(meta.at, '2026-11-04T03:30:00.000Z');
    assert.equal(meta.bounds.west, -76);
    assert.equal(woke, 1);
    const img = await map.inject(meta.image);
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/png');
  });
});

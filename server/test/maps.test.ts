import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PMTiles, zxyToTileId, type Source } from 'pmtiles';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { DEFAULT_BOUNDS, tilesIn } from '../src/maps/buildElevation.ts';
import { PmtilesReader, PmtilesWriter } from '../src/maps/pmtiles.ts';
import { createMapsService } from '../src/maps/service.ts';

const dir = mkdtempSync(join(tmpdir(), 'vikarg-maps-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** Lector de la librería oficial sobre un archivo local, para verificar que lo que escribimos cumple la especificación. */
function officialReader(path: string) {
  const bytes = readFileSync(path);
  const source: Source = {
    getKey: () => path,
    getBytes: async (offset, length) => ({ data: bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + length) as ArrayBuffer }),
  };
  return new PMTiles(source);
}

const tileBody = (z: number, x: number, y: number) => Buffer.from(`tile ${z}/${x}/${y}`);

async function writeArchive(path: string, tiles: { z: number; x: number; y: number; data: Buffer }[], tileType: 'mvt' | 'png' = 'mvt') {
  const w = await PmtilesWriter.create(path);
  for (const t of [...tiles].sort((a, b) => zxyToTileId(a.z, a.x, a.y) - zxyToTileId(b.z, b.x, b.y))) await w.add(zxyToTileId(t.z, t.x, t.y), t.data);
  return w.finish(path, {
    tileType,
    tileCompression: tileType === 'mvt' ? 'gzip' : 'none',
    minZoom: 0,
    maxZoom: Math.max(...tiles.map((t) => t.z)),
    bounds: { west: -76, south: -56, east: -53, north: -17 },
    metadata: { name: 'test' },
  });
}

describe('PMTiles', () => {
  it('escribe un archivo que lee la librería oficial, con teselas repetidas guardadas una sola vez', async () => {
    const path = join(dir, 'small.pmtiles');
    const sea = gzipSync('mar');
    const tiles = [
      { z: 0, x: 0, y: 0, data: gzipSync(tileBody(0, 0, 0)) },
      ...[0, 1].flatMap((x) => [0, 1].map((y) => ({ z: 1, x, y, data: sea }))),
      { z: 2, x: 1, y: 2, data: gzipSync(tileBody(2, 1, 2)) },
    ];
    const result = await writeArchive(path, tiles);
    assert.equal(result.tiles, 6);
    assert.equal(result.contents, 3);

    const official = officialReader(path);
    const header = await official.getHeader();
    assert.equal(header.maxZoom, 2);
    assert.equal(header.minLon, -76);
    assert.deepEqual((await official.getMetadata()) as object, { name: 'test' });
    assert.equal(Buffer.from((await official.getZxy(2, 1, 2))!.data).toString(), 'tile 2/1/2');
    assert.equal(Buffer.from((await official.getZxy(1, 1, 1))!.data).toString(), 'mar');
    assert.equal(await official.getZxy(2, 0, 0), undefined);

    // El nuestro entrega la tesela comprimida, tal como está guardada.
    const reader = await PmtilesReader.open(path);
    const t = await reader.tile(2, 1, 2);
    assert.equal(t?.encoding, 'gzip');
    assert.equal(gunzipSync(t!.data).toString(), 'tile 2/1/2');
    assert.equal(await reader.tile(2, 0, 0), null);
    assert.equal(await reader.tile(3, 0, 0), null);
    await reader.close();
  });

  it('con muchas teselas usa directorios hoja', async () => {
    const path = join(dir, 'big.pmtiles');
    const tiles: { z: number; x: number; y: number; data: Buffer }[] = [];
    // Largos distintos, para que el directorio no se comprima tanto y no entre en la raíz.
    let seed = 1;
    const pad = () => ' '.repeat((seed = (seed * 48271) % 2147483647) % 500);
    for (let x = 0; x < 256; x++) for (let y = 0; y < 128; y++) tiles.push({ z: 8, x, y, data: Buffer.concat([tileBody(8, x, y), Buffer.from(pad())]) });
    await writeArchive(path, tiles, 'png');
    const official = officialReader(path);
    const header = await official.getHeader();
    assert.ok((header.leafDirectoryLength ?? 0) > 0, 'tiene directorios hoja');
    for (const [x, y] of [[0, 0], [255, 127], [100, 37]] as const) {
      assert.equal(Buffer.from((await official.getZxy(8, x, y))!.data).toString().trimEnd(), `tile 8/${x}/${y}`);
    }
    const reader = await PmtilesReader.open(path);
    const t = await reader.tile(8, 200, 99);
    assert.equal(t?.encoding, null);
    assert.equal(t?.data.toString().trimEnd(), 'tile 8/200/99');
    assert.equal(await reader.tile(8, 10, 200), null);
    await reader.close();
  });

  it('la zona de elevación sale ordenada por tileId y sin repetidos', () => {
    const tiles = tilesIn(DEFAULT_BOUNDS, 6);
    assert.ok(tiles.length > 10);
    for (let i = 1; i < tiles.length; i++) assert.ok(tiles[i]!.id > tiles[i - 1]!.id);
    assert.deepEqual(tiles[0], { id: 0, z: 0, x: 0, y: 0 });
  });
});

describe('Rutas de mapas', () => {
  const mapsDir = join(dir, 'served');
  before(async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(mapsDir);
    await writeArchive(join(mapsDir, 'vector.pmtiles'), [
      { z: 0, x: 0, y: 0, data: gzipSync('mundo') },
      { z: 1, x: 0, y: 1, data: gzipSync('sur') },
    ]);
  });

  async function app(over: Partial<ReturnType<typeof loadConfig>> = {}) {
    const config = { ...loadConfig({}), mapsDir, ...over };
    return buildApp(config, openDb(':memory:'), { publicKey: 'k', send: async () => true }, false, undefined, undefined, undefined, createMapsService(config.mapsDir));
  }

  it('informa qué mapas tiene y entrega las teselas comprimidas', async () => {
    const a = await app();
    const info = (await a.inject({ url: '/api/maps' })).json();
    assert.equal(info.vector.maxZoom, 1);
    assert.deepEqual(info.vector.bounds, [-76, -56, -53, -17]);
    assert.equal(info.elevation, null);
    assert.equal(info.maxZoneTiles, 60_000);

    const res = await a.inject({ url: '/api/maps/vector/1/0/1' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(gunzipSync(res.rawPayload).toString(), 'sur');
    assert.equal((await a.inject({ url: '/api/maps/vector/1/1/1' })).statusCode, 204, 'sin datos ahí');
    assert.equal((await a.inject({ url: '/api/maps/elevation/0/0/0' })).statusCode, 404, 'sin archivo de elevación');
    assert.equal((await a.inject({ url: '/api/maps/otra/0/0/0' })).statusCode, 404);
    assert.equal((await a.inject({ url: '/api/maps/vector/1/x/0' })).statusCode, 400);
    await a.close();
  });

  it('con demasiados pedidos a la vez responde 503 para que la app use las fuentes públicas', async () => {
    const a = await app({ mapsMaxConcurrent: 0 });
    const res = await a.inject({ url: '/api/maps/vector/0/0/0' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['retry-after'], '30');
    await a.close();
  });

  it('muchos pedidos juntos al arrancar abren el archivo una sola vez', async () => {
    const opens: unknown[] = [];
    const original = PmtilesReader.open;
    PmtilesReader.open = async (path: string) => {
      const r = await original.call(PmtilesReader, path);
      opens.push(r);
      return r;
    };
    try {
      const maps = createMapsService(mapsDir);
      const tiles = await Promise.all(Array.from({ length: 20 }, () => maps.tile('vector', 1, 0, 1)));
      assert.ok(tiles.every((t) => t && gunzipSync(t.data).toString() === 'sur'));
      assert.equal(opens.length, 1);
      await maps.close();
    } finally {
      PmtilesReader.open = original;
    }
  });

  it('sin carpeta de mapas no tiene nada que ofrecer', async () => {
    const a = await app({ mapsDir: null });
    const info = (await a.inject({ url: '/api/maps' })).json();
    assert.equal(info.vector, null);
    assert.equal(info.elevation, null);
    await a.close();
  });
});

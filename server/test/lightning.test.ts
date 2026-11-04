import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import { glmFeed, parseGlm, startOfKey, type Flash } from '../src/lightning/glm.ts';
import { hasPlaces, runLightningWatch } from '../src/lightning/watch.ts';
import { distanceKm, withoutDuplicateHere } from '../src/places.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import type { RainPoint, RainSource } from '../src/rain/source.ts';
import { runRainWatch } from '../src/rain/watch.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const prefs = { timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' };
const casa = { id: 'w1', label: 'Casa', lat: -34.578, lon: -58.6307 };
const at = (min: number) => new Date(Date.UTC(2026, 10, 4, 18, min));
/** Un rayo a `km` al norte de Casa. */
const flashNorth = (km: number): Flash => ({ lat: casa.lat + km / 111.2, lon: casa.lon, at: 0 });

let db: Db;
let push: FakePush;
let app: FastifyInstance;

async function deviceWith(places: unknown[]) {
  const reg = (await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs } })).json() as { deviceId: string; token: string };
  const res = await app.inject({ method: 'PUT', url: `/api/devices/${reg.deviceId}/rain`, headers: { authorization: `Bearer ${reg.token}` }, payload: { places } });
  assert.equal(res.statusCode, 204);
  return reg;
}

describe('avisos de rayos', () => {
  beforeEach(async () => {
    db = openDb(':memory:');
    push = new FakePush();
    app = await buildApp(loadConfig({}), db, push, false);
  });

  it('lee un archivo real del GLM: solo rayos de buena calidad en la región', async () => {
    const flashes = await parseGlm(new Uint8Array(await readFile(new URL('./fixtures/glm-sample.nc', import.meta.url))), 123);
    assert.ok(flashes.length > 50);
    assert.ok(flashes.every((f) => f.lat >= -60 && f.lat <= -15 && f.lon >= -82 && f.lon <= -45 && f.at === 123));
    assert.equal(new Date(startOfKey('OR_GLM-L2-LCFA_G19_s20263080211400_e2026_c.nc')!).toISOString(), '2026-11-04T02:11:40.000Z');
  });

  it('avisa con distancia y rumbo, como mucho una vez cada 10 minutos', async () => {
    assert.equal(hasPlaces(db), false);
    await deviceWith([casa]);
    assert.equal(hasPlaces(db), true);

    await runLightningWatch(db, push, [flashNorth(45)], at(0)); // lejos
    assert.equal(push.sent.length, 0);

    await runLightningWatch(db, push, [flashNorth(45), flashNorth(12)], at(1));
    assert.deepEqual(push.sent[0], { type: 'lightning', lightning: { placeId: 'w1', label: 'Casa', distanceKm: 12, bearing: 0, fixAt: null } });

    // Muchos rayos seguidos: no avisa por cada uno.
    for (let m = 2; m <= 10; m++) await runLightningWatch(db, push, [flashNorth(5), flashNorth(6)], at(m));
    assert.equal(push.sent.length, 1);

    await runLightningWatch(db, push, [flashNorth(4)], at(11)); // pasaron 10 min y siguen cayendo
    assert.equal(push.sent.length, 2);
    assert.equal(push.sent[1]!.lightning!.distanceKm, 4);

    await runLightningWatch(db, push, [], at(25)); // sin rayos: no avisa
    await runLightningWatch(db, push, [flashNorth(20)], at(40));
    assert.equal(push.sent.length, 3);
  });

  it('"donde estoy" cerca de un waypoint con aviso se ignora (lluvia y rayos)', async () => {
    const fixAt = at(0).toISOString();
    await deviceWith([casa, { id: 'here', label: null, lat: -34.6, lon: -58.6, fixAt }]); // a ~4 km
    await runLightningWatch(db, push, [flashNorth(3)], at(1));
    assert.deepEqual(push.sent.map((p) => p.lightning!.placeId), ['w1']);

    const rain: RainSource = { name: 'x', outlooks: async (pts: RainPoint[]) => pts.map(() => ({ state: 'raining' as const, mm: 2 })) };
    push.sent = [];
    await runRainWatch(db, push, rain, at(1));
    assert.deepEqual(push.sent.map((p) => p.rain!.placeId), ['w1']);

    // Lejos del waypoint (~50 km), avisa en los dos.
    await deviceWith([casa, { id: 'here', label: null, lat: -34.15, lon: -58.6, fixAt }]);
    push.sent = [];
    await runLightningWatch(db, push, [flashNorth(1), { lat: -34.15, lon: -58.62, at: 0 }], at(2));
    assert.deepEqual(push.sent.map((p) => p.lightning!.placeId).sort(), ['here', 'w1']);
  });

  it('distancias y la regla de lugares repetidos', () => {
    assert.ok(Math.abs(distanceKm({ lat: -34.6, lon: -58.38 }, { lat: -41.13, lon: -71.31 }) - 1330) < 20);
    const places = [
      { device_id: 'a', place_id: 'here', lat: -34.6, lon: -58.6 },
      { device_id: 'b', place_id: 'w', lat: -34.6, lon: -58.6 }, // de otro dispositivo: no cuenta
    ];
    assert.equal(withoutDuplicateHere(places).length, 2);
  });

  it('el feed baja solo los archivos nuevos (como mucho uno por pasada)', async () => {
    const sample = await readFile(new URL('./fixtures/glm-sample.nc', import.meta.url));
    const downloads: string[] = [];
    let keys = ['OR_GLM-L2-LCFA_G19_s20263081800000_e_c.nc', 'OR_GLM-L2-LCFA_G19_s20263081800200_e_c.nc'];
    const fake = (async (url: string) => {
      if (url.includes('list-type=2')) {
        const xml = url.includes('/18/') ? keys.map((k) => `<Key>GLM-L2-LCFA/2026/308/18/${k}</Key>`).join('') : '';
        return new Response(xml, { status: 200 });
      }
      downloads.push(url.split('/').pop()!);
      return new Response(sample, { status: 200 });
    }) as typeof fetch;
    const feed = glmFeed(1, fake);
    const now = new Date('2026-11-04T18:00:30Z');
    assert.ok((await feed.poll(now)).length > 0);
    assert.deepEqual(downloads, ['OR_GLM-L2-LCFA_G19_s20263081800200_e_c.nc']);
    assert.equal((await feed.poll(now)).length, 0);
    keys = [...keys, 'OR_GLM-L2-LCFA_G19_s20263081800400_e_c.nc'];
    await feed.poll(now);
    assert.equal(downloads.length, 2);
  });
});

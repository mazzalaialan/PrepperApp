import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import { parseGdacs, parseUsgs, quakeRadiusKm, type HazardEvent } from '../src/hazards/sources.ts';
import { runHazardWatch } from '../src/hazards/watch.ts';
import { urgencyOf } from '../src/push.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const now = new Date('2026-11-04T18:00:00Z');
const sub = JSON.stringify({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } });

function setup(hazards = 1) {
  const db = openDb(':memory:');
  db.prepare(
    `INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, hazards, created_at, updated_at) VALUES ('d', 'h', ?, 'America/Argentina/Mendoza', 9, 'es', ?, '', '')`,
  ).run(sub, hazards);
  // Mendoza.
  db.prepare(`INSERT INTO rain_places (device_id, place_id, label, lat, lon) VALUES ('d', 'w1', 'Casa', -32.89, -68.84)`).run();
  return db;
}

const quake = (over: Partial<HazardEvent> = {}): HazardEvent => ({
  key: 'usgs:x1',
  kind: 'quake',
  lat: -32.3,
  lon: -69.5,
  name: '50 km NW of Mendoza',
  at: now.getTime() - 20 * 60_000,
  magnitude: 5.1,
  url: 'https://usgs/x1',
  ...over,
});

describe('peligros naturales', () => {
  it('lee sismos de USGS y eventos de GDACS', () => {
    const q = parseUsgs({
      features: [
        { id: 'a', properties: { mag: 4.66, place: 'Mendoza', time: 1, tsunami: 1, type: 'earthquake' }, geometry: { coordinates: [-69, -32, 10] } },
        { id: 'b', properties: { mag: 3, place: 'cantera', time: 1, type: 'quarry blast' }, geometry: { coordinates: [-69, -32] } },
      ],
    });
    assert.equal(q.length, 1);
    assert.equal(q[0]!.magnitude, 4.7);
    assert.equal(q[0]!.tsunami, true);
    const g = parseGdacs({
      features: [
        { properties: { eventtype: 'WF', eventid: 7, alertlevel: 'Orange', name: 'Incendio en Córdoba', datemodified: '2026-11-04T10:00:00', iscurrent: 'true' }, geometry: { type: 'Point', coordinates: [-64.5, -31.4] } },
        { properties: { eventtype: 'DR', eventid: 8, alertlevel: 'Red', iscurrent: 'true' }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { properties: { eventtype: 'FL', eventid: 9, alertlevel: 'Red', iscurrent: 'false' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    });
    assert.deepEqual(g.map((e) => [e.key, e.level]), [['gdacs:WF:7', 'Orange']]);
  });

  it('el radio crece con la magnitud', () => {
    assert.equal(quakeRadiusKm(3), 0);
    assert.equal(quakeRadiusKm(4.2), 100);
    assert.equal(quakeRadiusKm(7.5), 1500);
  });

  it('avisa una vez por evento y lugar, con distancia y rumbo', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runHazardWatch(db, push, [quake()], now)).sent, 1);
    const h = push.sent[0]!.hazard!;
    assert.equal(h.kind, 'quake');
    assert.equal(h.label, 'Casa');
    assert.ok(h.distanceKm > 70 && h.distanceKm < 100);
    // Al noroeste.
    assert.ok(h.bearing > 270 && h.bearing < 360);
    assert.equal((await runHazardWatch(db, push, [quake()], now)).sent, 0);
  });

  it('no avisa lejos, viejo, chico, ni a quien lo apagó', async () => {
    const push = new FakePush();
    const db = setup();
    // M4,2 a ~90 km: se avisa hasta 100 km; M3,6 a 90 km, no (hasta 40 km).
    assert.equal((await runHazardWatch(db, push, [quake({ magnitude: 3.6 })], now)).sent, 0);
    assert.equal((await runHazardWatch(db, push, [quake({ at: now.getTime() - 5 * 3_600_000 })], now)).sent, 0);
    assert.equal((await runHazardWatch(db, push, [quake({ lat: -20, lon: -65 })], now)).sent, 0);
    assert.equal((await runHazardWatch(setup(0), push, [quake()], now)).sent, 0);
  });

  it('un evento de GDACS que empeora se vuelve a avisar', async () => {
    const db = setup();
    const push = new FakePush();
    const fire: HazardEvent = { key: 'gdacs:WF:7', kind: 'WF', lat: -32.5, lon: -68.5, name: 'Incendio', at: now.getTime(), level: 'Green', url: 'u' };
    assert.equal((await runHazardWatch(db, push, [fire], now)).sent, 1);
    assert.equal((await runHazardWatch(db, push, [fire], now)).sent, 0);
    assert.equal((await runHazardWatch(db, push, [{ ...fire, level: 'Orange' }], now)).sent, 1);
    assert.equal(push.sent[1]!.hazard!.level, 'Orange');
  });

  it('lo urgente sale con prioridad alta', () => {
    assert.equal(urgencyOf({ type: 'hazard' }), 'high');
    assert.equal(urgencyOf({ type: 'lightning' }), 'high');
    assert.equal(urgencyOf({ type: 'alerts' }), 'normal');
    assert.equal(urgencyOf({ type: 'update' }), 'normal');
  });
});

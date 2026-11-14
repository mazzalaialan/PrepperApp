import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import { latestLevels } from '../src/rivers/ina.ts';
import { RIVER_RADIUS_KM, riverState, runRiverWatch, stationsToWatch, type RiverLevel, type RiverStation } from '../src/rivers/watch.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const sub = JSON.stringify({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } });
const now = new Date('2026-11-14T15:00:00Z');
// Buenos Aires: alerta 3,30 m, evacuación 3,90 m, aguas bajas 0,21 m.
const ba: RiverStation = { id: 85, name: 'Buenos Aires', river: 'Río de la Plata', lat: -34.5611, lon: -58.3993, alert: 3.3, evac: 3.9, low: 0.21, series: 85 };
const lvl = (level: number, minutesAgo = 30): Map<number, RiverLevel> => new Map([[85, { level, at: new Date(now.getTime() - minutesAgo * 60_000).toISOString() }]]);

function setup(lat = -34.57, lon = -58.4) {
  const db = openDb(':memory:');
  db.prepare(
    `INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, hazards, created_at, updated_at) VALUES ('d', 'h', ?, 'America/Argentina/Buenos_Aires', 9, 'es', 1, '', '')`,
  ).run(sub);
  db.prepare(`INSERT INTO rain_places (device_id, place_id, label, lat, lon) VALUES ('d', 'w1', 'Muelle', ?, ?)`).run(lat, lon);
  return db;
}

describe('estado de un río según los umbrales de su estación', () => {
  it('evacuación, alerta, aguas bajas y normal', () => {
    assert.equal(riverState(4, ba), 'evac');
    assert.equal(riverState(3.5, ba), 'alert');
    assert.equal(riverState(1.5, ba), 'normal');
    assert.equal(riverState(0.2, ba), 'low');
    assert.equal(riverState(9, { alert: 5, evac: null, low: null }), 'alert');
  });
});

describe('lectura del INA', () => {
  it('la última lectura con valor de cada serie', () => {
    const m = latestLevels([
      { series_id: 85, timestart: '2026-11-13T03:00:00.000Z', valor: 3.0 },
      { series_id: 85, timestart: '2026-11-14T03:00:00.000Z', valor: 3.5 },
      { series_id: 85, timestart: '2026-11-14T09:00:00.000Z', valor: null },
      { series_id: 14, timestart: '2026-11-14T03:00:00.000Z', valor: 10.1 },
    ]);
    assert.equal(m.get(85)!.level, 3.5);
    assert.equal(m.get(85)!.at, '2026-11-14T03:00:00.000Z');
    assert.equal(m.get(14)!.level, 10.1);
  });
});

describe('avisos de ríos cerca de un lugar guardado', () => {
  it('solo se piden las estaciones con un lugar a menos de 5 km', () => {
    assert.deepEqual(stationsToWatch(setup(), [ba], now).map((s) => s.id), [85]);
    // Rosario está a ~280 km: ninguna.
    assert.deepEqual(stationsToWatch(setup(-32.95, -60.64), [ba], now), []);
    assert.equal(RIVER_RADIUS_KM, 5);
  });

  it('avisa la alerta una vez, y otra vez solo si pasa a evacuación', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.5), now)).sent, 1);
    const r = push.sent[0]!.river!;
    assert.equal(push.sent[0]!.type, 'river');
    assert.equal(r.state, 'alert');
    assert.equal(r.station, 'Buenos Aires');
    assert.equal(r.threshold, 3.3);
    assert.equal(r.label, 'Muelle');
    // Mismo nivel: no repite.
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.6), now)).sent, 0);
    // Sube a evacuación: avisa de nuevo.
    assert.equal((await runRiverWatch(db, push, [ba], lvl(4.0), now)).sent, 1);
    assert.equal(push.sent[1]!.river!.state, 'evac');
    // Baja a alerta: no avisa (ya se avisó la evacuación).
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.5), now)).sent, 0);
  });

  it('cuando el río vuelve a lo normal, la próxima crecida avisa otra vez', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.5), now)).sent, 1);
    assert.equal((await runRiverWatch(db, push, [ba], lvl(1.5), now)).sent, 0); // normal: se borra lo avisado
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.5), now)).sent, 1);
  });

  it('avisa aguas bajas (nivel extremadamente bajo) una vez, y de nuevo en la próxima bajante', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, [ba], lvl(0.15), now)).sent, 1);
    assert.equal(push.sent[0]!.river!.state, 'low');
    assert.equal(push.sent[0]!.river!.threshold, 0.21);
    assert.equal((await runRiverWatch(db, push, [ba], lvl(0.1), now)).sent, 0);
    assert.equal((await runRiverWatch(db, push, [ba], lvl(1.5), now)).sent, 0);
    assert.equal((await runRiverWatch(db, push, [ba], lvl(0.15), now)).sent, 1);
  });

  it('un lugar lejos del río no recibe nada, aunque el río esté en evacuación', async () => {
    const db = setup(-34.9, -57.9); // La Plata, ~60 km
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, [ba], lvl(4.2), now)).sent, 0);
  });

  it('una lectura vieja (la estación dejó de reportar) no avisa ni da por terminada la crecida', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.5), now)).sent, 1);
    assert.equal((await runRiverWatch(db, push, [ba], lvl(1.5, 13 * 60), now)).sent, 0); // lectura de hace 13 h: se ignora
    // No se borró lo avisado: con la crecida otra vez no repite.
    assert.equal((await runRiverWatch(db, push, [ba], lvl(3.5), now)).sent, 0);
  });

  it('un dispositivo con los avisos de peligro apagados no recibe nada', async () => {
    const db = setup();
    db.prepare(`UPDATE devices SET hazards = 0`).run();
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, [ba], lvl(4.2), now)).sent, 0);
  });
});

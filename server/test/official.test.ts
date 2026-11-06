import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import { covers, parseCap, type OfficialAlert } from '../src/official/cap.ts';
import { capLinks, createOfficialCache, fetchOfficial } from '../src/official/sources.ts';
import { simplifyRing } from '../src/official/store.ts';
import { runOfficialWatch } from '../src/official/watch.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/official/${name}`, import.meta.url), 'utf8');

describe('lectura de CAP', () => {
  it('SMN: tormentas en Chubut, con zona, vigencia e instrucciones', () => {
    const [a] = parseCap(fixture('smn-cap.xml'), 'SMN');
    assert.equal(a!.event, 'Tormentas');
    assert.equal(a!.severity, 'Moderate');
    assert.equal(a!.senderName, 'Servicio Meteorologico Nacional');
    assert.match(a!.description, /tormentas aisladas de variada intensidad/);
    assert.match(a!.instruction, /Evitá salir/);
    assert.equal(a!.expires, '2026-11-05T20:59:59-03:00');
    assert.ok(covers(a!, -43.5, -66)); // adentro
    assert.ok(!covers(a!, -34.6, -58.4)); // Buenos Aires
  });

  it('DMC: varias zonas con varios polígonos', () => {
    const [a] = parseCap(fixture('dmc-cap.xml'), 'DMC');
    assert.equal(a!.event, 'Probables Tormentas Eléctricas');
    assert.equal(a!.severity, 'Minor');
    assert.ok(a!.areas.length >= 5);
    assert.ok(a!.areas.some((x) => x.desc === 'Los Lagos: Chiloe'));
  });

  it('INUMET: con prefijo cap:, un bloque por cada nivel', () => {
    const alerts = parseCap(fixture('inumet-cap.xml'), 'INUMET');
    assert.equal(alerts.length, 2);
    assert.ok(alerts.some((a) => a.severity === 'Severe'));
    assert.match(alerts[0]!.areas[0]!.desc, /Paysandú/);
  });

  it('ignora pruebas y cancelaciones', () => {
    const xml = fixture('smn-cap.xml');
    assert.equal(parseCap(xml.replace('<status>Actual</status>', '<status>Test</status>'), 'SMN').length, 0);
    assert.equal(parseCap(xml.replace('<msgType>Alert</msgType>', '<msgType>Cancel</msgType>'), 'SMN').length, 0);
  });

  it('enlaces a cada CAP desde el listado del SMN y los RSS de DMC e INUMET', () => {
    assert.equal(capLinks('SMN', fixture('smn-index.html')).length, 66);
    // A un programa, el SMN le devuelve el RSS en vez de la página.
    assert.deepEqual(capLinks('SMN', fixture('smn-rss.xml')).length, capLinks('SMN', fixture('smn-index.html')).length);
    assert.ok(capLinks('DMC', fixture('dmc-rss.xml')).every((l) => l.endsWith('_cap.xml')));
    // INUMET repite el mismo CAP en varios ítems: uno solo.
    assert.equal(new Set(capLinks('INUMET', fixture('inumet-rss.xml'))).size, capLinks('INUMET', fixture('inumet-rss.xml')).length);
  });

  it('simplifica las zonas sin perder la forma', () => {
    const [a] = parseCap(fixture('dmc-cap.xml'), 'DMC');
    const ring = a!.areas[0]!.polygons[0]!;
    const s = simplifyRing(ring);
    assert.ok(s.length <= ring.length && s.length >= 4);
  });
});

describe('bajar las fuentes', () => {
  it('baja solo los CAP nuevos y descarta los vencidos', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      const body = url.endsWith('rss.xml') ? fixture('inumet-rss.xml') : fixture('inumet-cap.xml');
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const cache = createOfficialCache();
    const during = Date.parse('2026-11-03T23:00:00-03:00');
    // El falso devuelve el mismo CAP (2 bloques) para cada enlace del RSS.
    const links = capLinks('INUMET', fixture('inumet-rss.xml')).length;
    assert.equal((await fetchOfficial('INUMET', cache, during, fake)).length, links * 2);
    assert.equal(calls.length, links + 1);
    const first = calls.length;
    await fetchOfficial('INUMET', cache, during, fake);
    assert.equal(calls.length, first + 1); // solo el RSS
    assert.equal((await fetchOfficial('INUMET', cache, Date.parse('2026-11-05T00:00:00-03:00'), fake)).length, 0);
  });
});

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const sub = JSON.stringify({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } });

function setup() {
  const db = openDb(':memory:');
  db.prepare(
    `INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, hazards, created_at, updated_at) VALUES ('d', 'h', ?, 'America/Argentina/Buenos_Aires', 9, 'es', 1, '', '')`,
  ).run(sub);
  // Trelew (adentro de la alerta del SMN) como waypoint; reserva en Rawson.
  db.prepare(`INSERT INTO rain_places (device_id, place_id, label, lat, lon) VALUES ('d', 'w1', 'Chacra', -43.5, -66.0)`).run();
  db.prepare(`INSERT INTO stock_places (device_id, place_id, label, lat, lon) VALUES ('d', 's1', 'Galpón', -43.6, -66.1)`).run();
  return db;
}

describe('avisos de alertas oficiales', () => {
  const now = new Date('2026-11-05T12:00:00-03:00');
  const alert = (over: Partial<OfficialAlert> = {}): OfficialAlert => ({ ...parseCap(fixture('smn-cap.xml'), 'SMN')[0]!, ...over });

  it('avisa una vez si la zona incluye un lugar, con las reservas que hay adentro', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runOfficialWatch(db, push, [alert()], now)).sent, 1);
    const o = push.sent[0]!.official!;
    assert.equal(o.source, 'SMN');
    assert.equal(o.event, 'Tormentas');
    assert.deepEqual(o.places, ['Chacra', 'Galpón']);
    assert.deepEqual(o.stock, ['Galpón']);
    assert.equal((await runOfficialWatch(db, push, [alert()], now)).sent, 0);
  });

  it('una renovación del mismo fenómeno no se vuelve a avisar; si empeora, sí', async () => {
    const db = setup();
    const push = new FakePush();
    await runOfficialWatch(db, push, [alert()], now);
    const renewed = alert({ key: 'SMN:otro:0', onset: '2026-11-05T20:00:00-03:00', expires: '2026-11-06T08:00:00-03:00' });
    assert.equal((await runOfficialWatch(db, push, [renewed], now)).sent, 0);
    const worse = alert({ key: 'SMN:peor:0', severity: 'Severe' });
    assert.equal((await runOfficialWatch(db, push, [worse], now)).sent, 1);
  });

  it('nada fuera de la zona, nada vencido, nada con los avisos apagados', async () => {
    const db = setup();
    const push = new FakePush();
    db.prepare(`UPDATE rain_places SET lat = -34.6, lon = -58.4`).run();
    db.prepare(`DELETE FROM stock_places`).run();
    assert.equal((await runOfficialWatch(db, push, [alert()], now)).sent, 0);
    const db2 = setup();
    assert.equal((await runOfficialWatch(db2, push, [alert()], new Date('2026-11-06T12:00:00-03:00'))).sent, 0);
    db2.prepare(`UPDATE devices SET hazards = 0`).run();
    assert.equal((await runOfficialWatch(db2, push, [alert()], now)).sent, 0);
  });

  it('también los canteros de la huerta', async () => {
    const db = setup();
    db.prepare(`DELETE FROM rain_places`).run();
    db.prepare(`DELETE FROM stock_places`).run();
    db.prepare(`INSERT INTO garden_places (device_id, place_id, label, lat, lon, frost) VALUES ('d', 'g1', 'Huerta', -43.5, -66.0, '[]')`).run();
    const push = new FakePush();
    assert.equal((await runOfficialWatch(db, push, [alert()], now)).sent, 1);
    assert.deepEqual(push.sent[0]!.official!.places, ['Huerta']);
  });
});

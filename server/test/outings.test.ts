import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import type { PushPayload, PushSender } from '../src/push.ts';
import { MAX_NOTICES, NOTICE_GAP_MS, runOutingWatch } from '../src/outings/watch.ts';

const sent: PushPayload[] = [];
let deliver = true;
const push: PushSender = { publicKey: 'k', async send(_s, payload) { sent.push(payload); return deliver; } };
const sub = { subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }, timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' };
const iso = (ms: number) => new Date(ms).toISOString();
const dl = (returnBy: number, over: Record<string, unknown> = {}) => ({ outingId: 'o-1', returnBy: iso(returnBy), title: 'Cerro: pasó la hora límite', body: 'Pasó hace un rato.', ...over });

describe('hora límite de una salida', () => {
  let db: Db;
  let app: FastifyInstance;
  let id: string;
  let auth: { authorization: string };
  beforeEach(async () => {
    sent.length = 0;
    deliver = true;
    db = openDb(':memory:');
    app = await buildApp(loadConfig({ DATA_DIR: ':memory:' }), db, push, false);
    const res = await app.inject({ method: 'POST', url: '/api/devices', payload: sub });
    const body = res.json() as { deviceId: string; token: string };
    id = body.deviceId;
    auth = { authorization: `Bearer ${body.token}` };
  });
  const put = (payload: unknown, headers: Record<string, string> = auth) => app.inject({ method: 'PUT', url: `/api/devices/${id}/deadline`, headers, payload: payload as object });

  it('exige el código del dispositivo', async () => {
    assert.equal((await put(dl(Date.now() + 3600_000), {})).statusCode, 401);
    assert.equal((await put(dl(Date.now() + 3600_000), { authorization: 'Bearer otro' })).statusCode, 401);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outing_deadlines').get()?.n, 0);
  });

  it('rechaza lo que no es una salida razonable', async () => {
    const now = Date.now();
    assert.equal((await put(dl(now - 3 * 86_400_000))).statusCode, 400); // de hace días
    assert.equal((await put(dl(now + 60 * 86_400_000))).statusCode, 400); // de dentro de dos meses
    assert.equal((await put(dl(now + 3600_000, { returnBy: 'mañana' }))).statusCode, 400);
    assert.equal((await put(dl(now + 3600_000, { outingId: '../../x' }))).statusCode, 400);
    assert.equal((await put(dl(now + 3600_000, { title: '' }))).statusCode, 400);
    assert.equal((await put(dl(now + 3600_000, { body: 'x'.repeat(301) }))).statusCode, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outing_deadlines').get()?.n, 0);
  });

  it('guarda una sola por dispositivo y se borra con el dispositivo', async () => {
    const now = Date.now();
    assert.equal((await put(dl(now + 3600_000))).statusCode, 204);
    assert.equal((await put(dl(now + 7200_000, { outingId: 'o-2' }))).statusCode, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outing_deadlines').get()?.n, 1);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/devices/${id}`, headers: auth })).statusCode, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outing_deadlines').get()?.n, 0);
  });

  it('antes de la hora no avisa; pasada, avisa, insiste cada 30 min y se detiene', async () => {
    const t0 = Date.now();
    await put(dl(t0 + 600_000));
    assert.equal((await runOutingWatch(db, push, new Date(t0))).sent, 0);
    const late = t0 + 700_000;
    assert.equal((await runOutingWatch(db, push, new Date(late))).sent, 1);
    assert.deepEqual(sent[0], { type: 'outing', outing: { outingId: 'o-1', title: 'Cerro: pasó la hora límite', body: 'Pasó hace un rato.' } });
    assert.equal((await runOutingWatch(db, push, new Date(late + 60_000))).sent, 0); // muy seguido
    assert.equal((await runOutingWatch(db, push, new Date(late + NOTICE_GAP_MS))).sent, 1);
    assert.equal((await runOutingWatch(db, push, new Date(late + 2 * NOTICE_GAP_MS))).sent, 1);
    assert.equal((await runOutingWatch(db, push, new Date(late + 3 * NOTICE_GAP_MS))).sent, 0); // ya fueron MAX_NOTICES
    assert.equal(sent.length, MAX_NOTICES);
  });

  it('extender la hora (o cerrar la salida) corta los avisos', async () => {
    const t0 = Date.now();
    await put(dl(t0 + 600_000));
    await runOutingWatch(db, push, new Date(t0 + 700_000));
    assert.equal(sent.length, 1);
    await put(dl(t0 + 700_000 + 3600_000)); // la extendió una hora
    assert.equal((await runOutingWatch(db, push, new Date(t0 + 700_000 + NOTICE_GAP_MS))).sent, 0);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/devices/${id}/deadline`, headers: auth })).statusCode, 204);
    assert.equal((await runOutingWatch(db, push, new Date(t0 + 10 * 3600_000))).sent, 0);
  });

  it('repetir el mismo envío no reinicia la cuenta de avisos', async () => {
    const t0 = Date.now();
    await put(dl(t0 + 600_000));
    await runOutingWatch(db, push, new Date(t0 + 700_000));
    await put(dl(t0 + 600_000));
    assert.equal((await runOutingWatch(db, push, new Date(t0 + 760_000))).sent, 0);
  });

  it('una suscripción que ya no existe borra el dispositivo', async () => {
    const t0 = Date.now();
    await put(dl(t0 + 600_000));
    deliver = false;
    const r = await runOutingWatch(db, push, new Date(t0 + 700_000));
    assert.deepEqual(r, { sent: 0, removed: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM devices').get()?.n, 0);
  });

  it('borra los vencidos de hace más de medio día', async () => {
    const t0 = Date.now();
    await put(dl(t0 + 600_000));
    await runOutingWatch(db, push, new Date(t0 + 13 * 3600_000));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outing_deadlines').get()?.n, 0);
  });
});

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import type { PushSender } from '../src/push.ts';
import { applyUpdate, parseCreate, parseUpdate, renderLivePage, type LiveData } from '../src/routes/liveSessions.ts';

const push: PushSender = { publicKey: 'k', async send() { return true; } };
const stats = { distanceM: 1234.4, elapsedS: 600, ascentM: 20, paceSPerKm: 330, speedKmh: 10.9 };
const update = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  stats,
  chunks: [{ newSegment: false, points: [[-32.9, -69.1, 1_800_000_000], [-32.901, -69.101, 1_800_000_010]] }],
  ...over,
});

describe('seguimiento en vivo', () => {
  let db: Db;
  let app: FastifyInstance;
  beforeEach(async () => {
    db = openDb(':memory:');
    app = await buildApp(loadConfig({ DATA_DIR: ':memory:', LIVE_SESSIONS_MAX: '2' }), db, push, false);
  });

  it('solo acepta las duraciones previstas y un nombre', () => {
    assert.ok(parseCreate({ name: 'Trote', durationMin: 15 }));
    assert.ok(parseCreate({ name: 'Trote', durationMin: 60, lang: 'en', kind: 'run' }));
    assert.equal(parseCreate({ name: 'Trote', durationMin: 7 }), null);
    assert.equal(parseCreate({ name: '  ', durationMin: 60 }), null);
    assert.equal(parseCreate(null), null);
  });

  it('valida los envíos: coordenadas, cantidad y datos', () => {
    assert.ok(parseUpdate(update()));
    assert.equal(parseUpdate(update({ status: 'otro' })), null);
    assert.equal(parseUpdate(update({ chunks: [{ points: [[91, 0, 1]] }] })), null);
    assert.equal(parseUpdate(update({ stats: { ...stats, distanceM: -1 } })), null);
    const many = Array.from({ length: 121 }, (_, i) => [-32, -69, i]);
    assert.equal(parseUpdate(update({ chunks: [{ points: many }] })), null);
  });

  it('suma puntos al tramo actual o abre uno nuevo, y acota el total', () => {
    let data: LiveData = { name: 'x', lang: 'es', kind: 'run', status: 'active', segments: [], stats: { distanceM: 0, elapsedS: 0, ascentM: 0, paceSPerKm: 0, speedKmh: 0 } };
    data = applyUpdate(data, parseUpdate(update())!);
    assert.equal(data.segments.length, 1);
    data = applyUpdate(data, parseUpdate(update({ chunks: [{ newSegment: false, points: [[-32.902, -69.102, 1_800_000_020]] }] }))!);
    assert.equal(data.segments[0]!.length, 3);
    data = applyUpdate(data, parseUpdate(update({ chunks: [{ newSegment: true, points: [[-32.95, -69.2, 1_800_000_900]] }] }))!);
    assert.equal(data.segments.length, 2);
    let big = data;
    for (let i = 0; i < 40; i++) big = applyUpdate(big, parseUpdate(update({ chunks: [{ newSegment: false, points: Array.from({ length: 120 }, (_, k) => [-33, -70, i * 1000 + k]) }] }))!);
    assert.ok(big.segments.flat().length <= 4000);
  });

  it('la página es HTML sin scripts, se recarga sola y escapa el nombre', () => {
    const data: LiveData = { name: '<b>Trote</b>', lang: 'es', kind: 'run', status: 'active', segments: [[[-32.9, -69.1, 1], [-32.91, -69.11, 2], [-32.92, -69.12, 3]]], stats: { distanceM: 1234, elapsedS: 600, ascentM: 20, paceSPerKm: 330, speedKmh: 10.9 } };
    const html = renderLivePage(data, 1_000_000, 1_020_000);
    assert.match(html, /http-equiv="refresh" content="30"/);
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, /&lt;b&gt;Trote&lt;\/b&gt;/);
    assert.match(html, /5:30 \/km/);
    assert.doesNotMatch(html, /perder|perdido señal/);
    assert.match(renderLivePage(data, 1_000_000, 1_000_000 + 6 * 60_000), /perdido señal/);
  });

  it('crea, actualiza con el código, se ve en la página y se corta', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/live', payload: { name: 'Trote al Platita', durationMin: 60, lang: 'es', kind: 'run' } });
    assert.equal(created.statusCode, 201);
    const { id, path, token } = created.json() as { id: string; path: string; token: string };
    assert.equal(path, `/l/${id}`);
    // Sin código o con otro: no.
    assert.equal((await app.inject({ method: 'PUT', url: `/api/live/${id}`, payload: update() })).statusCode, 401);
    assert.equal((await app.inject({ method: 'PUT', url: `/api/live/${id}`, headers: { authorization: 'Bearer otro' }, payload: update() })).statusCode, 401);
    const ok = await app.inject({ method: 'PUT', url: `/api/live/${id}`, headers: { authorization: `Bearer ${token}` }, payload: update() });
    assert.equal(ok.statusCode, 204);
    // Un segundo envío enseguida se frena.
    assert.equal((await app.inject({ method: 'PUT', url: `/api/live/${id}`, headers: { authorization: `Bearer ${token}` }, payload: update() })).statusCode, 429);
    const page = await app.inject({ method: 'GET', url: path });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Trote al Platita/);
    assert.match(page.headers['content-security-policy'] as string, /default-src 'none'/);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/live/${id}`, headers: { authorization: 'Bearer otro' } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/live/${id}`, headers: { authorization: `Bearer ${token}` } })).statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url: path })).statusCode, 404);
  });

  it('un seguimiento vencido deja de verse y de aceptar envíos', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/live', payload: { name: 'Corto', durationMin: 15 } });
    const { id, path, token } = created.json() as { id: string; path: string; token: string };
    db.prepare('UPDATE live_sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, id);
    assert.equal((await app.inject({ method: 'GET', url: path })).statusCode, 404);
    assert.equal((await app.inject({ method: 'PUT', url: `/api/live/${id}`, headers: { authorization: `Bearer ${token}` }, payload: update() })).statusCode, 401);
  });

  it('tiene tope de seguimientos activos', async () => {
    for (let i = 0; i < 2; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/live', payload: { name: `n${i}`, durationMin: 60 } })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: '/api/live', payload: { name: 'tercero', durationMin: 60 } })).statusCode, 503);
  });
});

describe('hora límite en la página de la familia', () => {
  const data = (deadline?: unknown): LiveData => ({ name: 'Cerro', lang: 'es', kind: 'trek', status: 'active', segments: [], stats: { distanceM: 0, elapsedS: 0, ascentM: 0, paceSPerKm: 0, speedKmh: 0 }, ...(deadline ? { deadline: deadline as LiveData['deadline'] } : {}) });
  const now = 1_800_000_000_000;

  it('valida la hora límite del envío', () => {
    assert.equal(parseUpdate(update({ deadline: { returnBy: now, lastCheckIn: null } }))?.deadline?.returnBy, now);
    assert.equal(parseUpdate(update({ deadline: { returnBy: 'ayer' } })), null);
    assert.equal(parseUpdate(update({ deadline: { returnBy: now, lastCheckIn: 'x' } })), null);
    assert.equal(parseUpdate(update({ deadline: 5 })), null);
    assert.equal(parseUpdate(update())?.deadline, undefined);
  });

  it('un envío sin hora límite la saca de la página', () => {
    const withDl = applyUpdate(data({ returnBy: now, lastCheckIn: null }), parseUpdate(update({ deadline: { returnBy: now + 60_000, lastCheckIn: now - 1000 } }))!);
    assert.deepEqual(withDl.deadline, { returnBy: now + 60_000, lastCheckIn: now - 1000 });
    assert.equal(applyUpdate(withDl, parseUpdate(update())!).deadline, undefined);
  });

  it('antes de la hora dice cuánto falta; pasada, da la alarma con el último "estoy bien" y qué hacer', () => {
    const soon = renderLivePage(data({ returnBy: now + 3_600_000, lastCheckIn: null }), now, now);
    assert.match(soon, /Hora límite de regreso: faltan 1 h 00 min/);
    assert.doesNotMatch(soon, /class="alarm"/);
    const late = renderLivePage(data({ returnBy: now - 2 * 3_600_000, lastCheckIn: now - 40 * 60_000 }), now, now);
    assert.match(late, /class="alarm"/);
    assert.match(late, /Pasó la hora límite de regreso hace 2 h 00 min/);
    assert.match(late, /Último «estoy bien»: hace 40 min/);
    assert.match(late, /llamá a los servicios de emergencia/);
    assert.match(renderLivePage(data({ returnBy: now - 1000, lastCheckIn: null }), now, now), /Todavía no dio ningún «estoy bien»/);
  });
});

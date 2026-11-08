import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import type { PushSender } from '../src/push.ts';
import { parseSharedOuting, profileSvg, renderOutingPage, routeSvg } from '../src/routes/sharedOutings.ts';

const push: PushSender = { publicKey: 'k', async send() { return true; } };

const outing = (over: Record<string, unknown> = {}) => ({
  name: 'Salida al Platita',
  lang: 'es',
  date: '2026-11-08',
  kinds: ['trek', 'walk'],
  activities: 2,
  distanceM: 12_345.6,
  totalS: 18_000,
  ascentM: 1100,
  descentM: 1050,
  calories: 2400,
  maxEle: 3100,
  minEle: 1500,
  route: [[[-32.9, -69.1], [-32.91, -69.11], [-32.92, -69.12]]],
  profile: [[0, 1500], [6000, 2300], [12_345, 3100]],
  ...over,
});

describe('salidas compartidas', () => {
  let db: Db;
  let app: FastifyInstance;
  beforeEach(async () => {
    db = openDb(':memory:');
    app = await buildApp(loadConfig({ DATA_DIR: ':memory:', SHARED_OUTINGS_MAX: '3' }), db, push, false);
  });

  it('valida y limpia: rechaza lo que no corresponde y redondea', () => {
    const ok = parseSharedOuting(outing())!;
    assert.equal(ok.distanceM, 12_346);
    assert.deepEqual(ok.route[0]![0], [-32.9, -69.1]);
    assert.equal(parseSharedOuting(outing({ name: '   ' })), null);
    assert.equal(parseSharedOuting(outing({ distanceM: -1 })), null);
    assert.equal(parseSharedOuting(outing({ date: 'ayer' })), null);
    assert.equal(parseSharedOuting(outing({ route: [[[91, 0], [0, 0]]] })), null);
    assert.equal(parseSharedOuting(outing({ route: [Array.from({ length: 1600 }, (_, i) => [-30 + i * 1e-4, -60])] })), null);
    assert.equal(parseSharedOuting(null), null);
    // Solo los campos conocidos: lo demás (notas, fotos…) no pasa.
    const extra = parseSharedOuting({ ...outing(), notes: 'mi casa está en…', photo: 'data:image/png;base64,AAAA' })!;
    assert.equal('notes' in extra, false);
    assert.equal('photo' in extra, false);
    assert.deepEqual(parseSharedOuting(outing({ kinds: ['trek', '<script>', 'walk'] }))!.kinds, ['trek', 'walk']);
  });

  it('la página escapa el título y no lleva scripts', () => {
    const html = renderOutingPage(parseSharedOuting(outing({ name: '<img src=x onerror=alert(1)> "Platita" & co' }))!, 'https://x/o/abc', 'https://x');
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &quot;Platita&quot; &amp; co'));
    assert.ok(!/<script/i.test(html));
    assert.match(html, /og:title" content="&lt;img/);
    assert.match(html, /12,3 km/);
    assert.match(html, /5 h 00 min/);
    assert.match(html, /Trekking · Caminata/);
    assert.match(html, /<polyline/);
    const en = renderOutingPage(parseSharedOuting(outing({ lang: 'en' }))!, 'u', 'https://x');
    assert.match(en, /<html lang="en">/);
    assert.match(en, /Max altitude/);
    assert.equal(routeSvg([], { start: 'a', end: 'b' }), '');
    assert.equal(profileSvg([[0, 1]]), '');
  });

  it('crear, ver la página pública y borrar solo con el código', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/outings', payload: outing() });
    assert.equal(created.statusCode, 201);
    const { id, path, deleteToken } = created.json() as { id: string; path: string; deleteToken: string };
    assert.equal(path, `/o/${id}`);
    assert.ok(id.length >= 10 && deleteToken.length >= 30);

    const page = await app.inject({ method: 'GET', url: `/o/${id}` });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'] as string, /text\/html/);
    assert.match(page.headers['content-security-policy'] as string, /default-src 'none'/);
    assert.equal(page.headers['x-robots-tag'], 'noindex');
    assert.match(page.body, /Salida al Platita/);
    // Lo guardado no incluye el código de borrado (solo su hash).
    const row = db.prepare('SELECT token_hash, data FROM shared_outings WHERE id = ?').get(id) as { token_hash: string; data: string };
    assert.ok(!row.data.includes(deleteToken) && row.token_hash !== deleteToken);

    assert.equal((await app.inject({ method: 'DELETE', url: `/api/outings/${id}` })).statusCode, 401);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/outings/${id}`, headers: { authorization: 'Bearer otro' } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/outings/${id}`, headers: { authorization: `Bearer ${deleteToken}` } })).statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url: `/o/${id}` })).statusCode, 404);
  });

  it('topes: datos inválidos, cantidad máxima, vencimiento y pedidos por hora', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/outings', payload: { name: 'x' } })).statusCode, 400);
    for (let i = 0; i < 3; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/outings', payload: outing() })).statusCode, 201);
    // Llegó al tope de 3: no se acepta más.
    assert.equal((await app.inject({ method: 'POST', url: '/api/outings', payload: outing() })).statusCode, 503);
    // Vencidas: se limpian al crear y no se muestran.
    db.prepare('UPDATE shared_outings SET expires_at = ?').run(Date.now() - 1000);
    const id = (db.prepare('SELECT id FROM shared_outings LIMIT 1').get() as { id: string }).id;
    assert.equal((await app.inject({ method: 'GET', url: `/o/${id}` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/outings', payload: outing() })).statusCode, 201);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM shared_outings').get() as { n: number }).n, 1);
    // Más de 10 por hora desde la misma IP.
    const app2 = await buildApp(loadConfig({ DATA_DIR: ':memory:', SHARED_OUTINGS_MAX: '100' }), openDb(':memory:'), push, false);
    for (let i = 0; i < 10; i++) assert.equal((await app2.inject({ method: 'POST', url: '/api/outings', payload: outing() })).statusCode, 201);
    assert.equal((await app2.inject({ method: 'POST', url: '/api/outings', payload: outing() })).statusCode, 429);
  });
});

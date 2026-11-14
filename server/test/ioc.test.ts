import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { fetchIocLevels, reduceReadings, type IocLevels } from '../src/ioc/levels.ts';
import { iocRoutes } from '../src/routes/ioc.ts';
import { loadConfig } from '../src/config.ts';

const T0 = Date.parse('2026-11-14T12:00:00Z');
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
// Un minuto por lectura durante una hora, en dos sensores.
const raw = (n = 60) => [
  ...Array.from({ length: n }, (_, i) => ({ slevel: 1 + i / 100, stime: stamp(T0 + i * 60_000), sensor: 'prs' })),
  ...Array.from({ length: n }, (_, i) => ({ slevel: 5 + i / 100, stime: stamp(T0 + i * 60_000), sensor: 'rad' })),
];

describe('niveles medidos del IOC', () => {
  it('elige un sensor, promedia cada 10 minutos y descarta valores imposibles', () => {
    const r = reduceReadings([...raw(), { slevel: 999, stime: stamp(T0), sensor: 'rad' }, { slevel: null, stime: stamp(T0), sensor: 'rad' }])!;
    assert.equal(r.sensor, 'rad'); // mismas lecturas: gana el de mejor preferencia (radar)
    assert.equal(r.points.length, 6);
    assert.ok(Math.abs(r.points[0]![1] - 5.045) < 1e-9); // promedio de 5.00 … 5.09
    assert.equal(r.points[0]![0], T0 + 5 * 60_000);
  });

  it('sin lecturas suficientes no devuelve nada', () => {
    assert.equal(reduceReadings(raw(3)), null);
    assert.equal(reduceReadings([]), null);
  });

  it('manda la clave en el encabezado y pide la ventana de 30 horas', async () => {
    let seen: { url: string; key: string | null } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, key: new Headers(init.headers).get('x-api-key') };
      return new Response(JSON.stringify(raw()));
    }) as unknown as typeof fetch;
    const out = await fetchIocLevels('anto2', 'SECRETA', T0 + 3_600_000, fake);
    assert.equal(seen!.key, 'SECRETA');
    assert.match(seen!.url, /\/v2\/stations\/anto2\/data\?timestart=2026-11-13T07:00&timestop=2026-11-14T13:00/);
    assert.equal(out.sensor, 'rad');
    await assert.rejects(fetchIocLevels('anto2', 'x', T0, (async () => new Response('[]', { status: 500 })) as unknown as typeof fetch));
  });
});

describe('GET /api/ioc/:code', () => {
  const levels = (fetchedAt: number): IocLevels => ({ code: 'anto2', sensor: 'rad', fetchedAt, points: [[T0, 5.1]] });
  const build = (key: string | null, fetch: () => Promise<IocLevels>, clock: { t: number }) => {
    const app = Fastify();
    iocRoutes(app, { ...loadConfig({}), iocApiKey: key, appDir: new URL('../../app/public', import.meta.url).pathname }, { fetch }, () => clock.t);
    return app;
  };
  const get = (app: ReturnType<typeof build>, code: string) => app.inject({ method: 'GET', url: `/api/ioc/${code}` });

  it('sin clave configurada está apagado, y solo atiende estaciones del catálogo', async () => {
    const clock = { t: 1_000_000 };
    assert.equal((await get(build(null, async () => levels(clock.t), clock), 'anto2')).statusCode, 404);
    const app = build('K', async () => levels(clock.t), clock);
    assert.equal((await get(app, 'zzzz')).statusCode, 404);
    assert.equal((await get(app, '..%2Fetc')).statusCode, 404);
  });

  it('guarda 5 minutos y, si el IOC falla, devuelve el último bueno marcado como viejo', async () => {
    const clock = { t: 1_000_000 };
    let calls = 0;
    let fail = false;
    const app = build('K', async () => {
      calls++;
      if (fail) throw new Error('IOC 500');
      return levels(clock.t);
    }, clock);
    const a = await get(app, 'anto2');
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().stale, false);
    assert.equal(a.headers['cache-control'], 'no-store');
    clock.t += 2 * 60_000;
    await get(app, 'anto2');
    assert.equal(calls, 1);
    clock.t += 4 * 60_000;
    fail = true;
    const stale = await get(app, 'anto2');
    assert.equal(calls, 2);
    assert.equal(stale.json().stale, true);
    clock.t += 7 * 3_600_000;
    assert.equal((await get(app, 'anto2')).statusCode, 503);
  });
});

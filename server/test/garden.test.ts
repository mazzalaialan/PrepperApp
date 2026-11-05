import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import { runGardenWatch, waterDeficit, type GardenDay } from '../src/garden/watch.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';

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

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 10 días secos (ET0 5 mm) hasta hoy y 3 de pronóstico; mañana con −1 °C. */
function days(today: string, over: Partial<Record<string, Partial<GardenDay>>> = {}): GardenDay[] {
  return Array.from({ length: 13 }, (_, i) => {
    const date = addDays(today, i - 10);
    return { date, et0: 5, rain: 0, min: date === addDays(today, 1) ? -1 : 8, ...over[date] };
  });
}

let db: Db;
let push: FakePush;
let app: FastifyInstance;

async function register() {
  const res = await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs } });
  return res.json() as { deviceId: string; token: string };
}

const casa = {
  id: '-34.92,-57.95',
  label: 'Cantero 1, Cantero 2',
  lat: -34.92,
  lon: -57.95,
  frost: [
    { name: 'Tomate', threshold: 2 },
    { name: 'Lechuga', threshold: -2 },
  ],
  water: { kc: 1, thresholdMm: 15, wateredOn: null },
};

function put(d: { deviceId: string; token: string }, body: Record<string, unknown>) {
  return app.inject({ method: 'PUT', url: `/api/devices/${d.deviceId}/garden`, headers: { authorization: `Bearer ${d.token}` }, payload: body });
}

describe('huerta con la app cerrada', () => {
  beforeEach(async () => {
    db = openDb(':memory:');
    push = new FakePush();
    app = await buildApp(loadConfig({}), db, push, false);
  });

  it('déficit de agua: igual que en la app (las garúas no cuentan, el riego reinicia)', () => {
    assert.equal(waterDeficit(days('2026-11-20'), '2026-11-20', { kc: 1, thresholdMm: 15, wateredOn: null }), 45);
    assert.equal(waterDeficit(days('2026-11-20'), '2026-11-20', { kc: 1, thresholdMm: 15, wateredOn: '2026-11-19' }), 5);
    const rainy = days('2026-11-20', { '2026-11-19': { rain: 40 } });
    assert.equal(waterDeficit(rainy, '2026-11-20', { kc: 1, thresholdMm: 15, wateredOn: null }), 12);
  });

  it('un solo aviso de helada por lugar, a la tarde, y no se repite', async () => {
    const d = await register();
    assert.equal((await put(d, { places: [casa], tasks: [] })).statusCode, 204);
    const today = '2026-11-05';
    const source = async () => days(today);
    // A las 10 todavía no: la helada se avisa desde las 17.
    await runGardenWatch(db, push, source, new Date('2026-11-05T13:00:00Z'));
    assert.equal(push.sent.filter((p) => p.garden?.kind === 'frost').length, 0);
    await runGardenWatch(db, push, source, new Date('2026-11-05T21:00:00Z'));
    const frost = push.sent.filter((p) => p.garden?.kind === 'frost');
    assert.equal(frost.length, 1);
    assert.deepEqual((frost[0]!.garden as { crops: string[] }).crops, ['Tomate']);
    await runGardenWatch(db, push, source, new Date('2026-11-05T22:00:00Z'));
    assert.equal(push.sent.filter((p) => p.garden?.kind === 'frost').length, 1);
    // Volver a mandar los mismos lugares no hace repetir el aviso.
    await put(d, { places: [casa], tasks: [] });
    await runGardenWatch(db, push, source, new Date('2026-11-05T23:00:00Z'));
    assert.equal(push.sent.filter((p) => p.garden?.kind === 'frost').length, 1);
  });

  it('riego: un aviso por episodio; al marcar "regué" se vuelve a contar', async () => {
    const d = await register();
    await put(d, { places: [{ ...casa, frost: [] }], tasks: [] });
    const source = async () => days('2026-11-05');
    await runGardenWatch(db, push, source, new Date('2026-11-05T13:00:00Z'));
    assert.equal(push.sent.length, 1);
    assert.equal(push.sent[0]!.garden?.kind, 'water');
    await runGardenWatch(db, push, source, new Date('2026-11-06T13:00:00Z'));
    assert.equal(push.sent.length, 1, 'mismo episodio: no repite');
    await put(d, { places: [{ ...casa, frost: [], water: { ...casa.water, wateredOn: '2026-11-06' } }], tasks: [] });
    await runGardenWatch(db, push, async () => days('2026-11-07'), new Date('2026-11-07T13:00:00Z'));
    assert.equal(push.sent.length, 1, 'regado ayer: todavía alcanza');
  });

  it('tareas: las que corresponden, juntas, una sola vez', async () => {
    const d = await register();
    await put(d, {
      places: [],
      tasks: [
        { id: 'a:transplant', text: 'Trasplantar Tomate', date: '2026-11-01' },
        { id: 'b:harvest', text: 'Ya se puede cosechar Lechuga', date: '2026-11-05' },
        { id: 'c:harvest', text: 'Ya se puede cosechar Zapallo', date: '2027-01-10' },
      ],
    });
    const none = async () => null;
    await runGardenWatch(db, push, none, new Date('2026-11-05T11:00:00Z'));
    assert.equal(push.sent.length, 0, 'antes de la hora de aviso');
    await runGardenWatch(db, push, none, new Date('2026-11-05T13:00:00Z'));
    assert.deepEqual(push.sent[0]!.garden, { kind: 'tasks', tasks: ['Trasplantar Tomate', 'Ya se puede cosechar Lechuga'] });
    await runGardenWatch(db, push, none, new Date('2026-11-05T14:00:00Z'));
    assert.equal(push.sent.length, 1);
  });

  it('sin token no se puede cargar', async () => {
    const d = await register();
    const res = await app.inject({ method: 'PUT', url: `/api/devices/${d.deviceId}/garden`, payload: { places: [], tasks: [] } });
    assert.equal(res.statusCode, 401);
  });
});

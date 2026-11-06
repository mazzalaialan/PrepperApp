import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { createSourceMonitor, type AdminNotifier } from '../src/monitor/sources.ts';

function setup() {
  const db = openDb(':memory:');
  const sent: { subject: string; text: string }[] = [];
  const notifier: AdminNotifier = { send: async (subject, text) => void sent.push({ subject, text }) };
  let t = Date.parse('2026-11-06T12:00:00Z');
  const clock = { now: () => t, advance: (min: number) => (t += min * 60_000) };
  const monitor = createSourceMonitor(db, notifier, () => undefined, { minFailures: 3, minDownMs: 30 * 60_000, publicUrl: 'https://vikarg.example' }, clock.now);
  return { db, sent, clock, monitor };
}

describe('fuentes caídas: aviso al administrador', () => {
  it('avisa una sola vez después de 3 fallas seguidas y 30 min, y avisa cuando vuelve', async () => {
    const { sent, clock, monitor } = setup();
    await monitor.fail('SMN', 'Las alertas del SMN', new Error('503'));
    clock.advance(10);
    await monitor.fail('SMN', 'Las alertas del SMN', new Error('503'));
    clock.advance(10);
    await monitor.fail('SMN', 'Las alertas del SMN', new Error('503'));
    assert.equal(sent.length, 0, 'todavía no pasaron 30 min');
    clock.advance(10);
    await monitor.fail('SMN', 'Las alertas del SMN', new Error('fetch failed'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.subject, 'VikArg: Las alertas del SMN no responde');
    assert.match(sent[0]!.text, /fetch failed/);
    assert.match(sent[0]!.text, /https:\/\/vikarg\.example\/api\/health/);
    clock.advance(10);
    await monitor.fail('SMN', 'Las alertas del SMN', new Error('fetch failed'));
    assert.equal(sent.length, 1, 'no se repite mientras sigue caída');
    assert.deepEqual(monitor.down().map((d) => d.source), ['SMN']);
    await monitor.ok('SMN', 'Las alertas del SMN');
    assert.equal(sent.length, 2);
    assert.equal(sent[1]!.subject, 'VikArg: Las alertas del SMN volvió a responder');
    assert.deepEqual(monitor.down(), []);
  });

  it('una falla suelta que se recupera no avisa nada', async () => {
    const { sent, clock, monitor } = setup();
    await monitor.fail('OAVV', 'El nivel de alerta de los volcanes', new Error('timeout'));
    clock.advance(40);
    await monitor.ok('OAVV', 'El nivel de alerta de los volcanes');
    assert.equal(sent.length, 0);
  });

  it('sin correo configurado no rompe ni reintenta en cada vuelta', async () => {
    const db = openDb(':memory:');
    const logs: string[] = [];
    let t = 0;
    const monitor = createSourceMonitor(db, null, (m) => void logs.push(m), { minFailures: 1, minDownMs: 0 }, () => t);
    await monitor.fail('usgs', 'Los sismos de USGS', new Error('x'));
    t += 1;
    await monitor.fail('usgs', 'Los sismos de USGS', new Error('x'));
    assert.equal(logs.filter((l) => l.includes('falta configurar')).length, 1);
  });
});

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import type { PushSender } from '../src/push.ts';
import { createDeviceLimiter, DEVICE_FAILURES_PER_10MIN, DEVICE_REQUESTS_PER_MIN } from '../src/routes/devices.ts';

const push: PushSender = { publicKey: 'k', async send() { return true; } };

describe('límite de pedidos a /api/devices', () => {
  it('frena al pasar el tope por minuto y se libera al pasar la ventana', () => {
    let t = 1_000_000;
    const lim = createDeviceLimiter(() => t);
    for (let i = 0; i < DEVICE_REQUESTS_PER_MIN; i++) assert.equal(lim.blocked('1.1.1.1'), false);
    assert.equal(lim.blocked('1.1.1.1'), true);
    assert.equal(lim.blocked('2.2.2.2'), false); // otra IP no se ve afectada
    t += 61_000;
    assert.equal(lim.blocked('1.1.1.1'), false);
  });

  it('frena a quien acumula intentos con código inválido, aunque no pase el tope por minuto', () => {
    let t = 1_000_000;
    const lim = createDeviceLimiter(() => t);
    for (let i = 0; i < DEVICE_FAILURES_PER_10MIN; i++) lim.failed('3.3.3.3');
    assert.equal(lim.blocked('3.3.3.3'), true);
    assert.equal(lim.blocked('4.4.4.4'), false);
    t += 601_000;
    assert.equal(lim.blocked('3.3.3.3'), false);
  });

  describe('en el servidor', () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      app = await buildApp(loadConfig({ DATA_DIR: ':memory:' }), openDb(':memory:'), push, false);
    });
    it('después de muchos intentos con código inválido responde 429; las demás rutas no se afectan', async () => {
      for (let i = 0; i < DEVICE_FAILURES_PER_10MIN; i++) {
        const res = await app.inject({ method: 'DELETE', url: '/api/devices/no-existe', headers: { authorization: 'Bearer malo' } });
        assert.equal(res.statusCode, 401);
      }
      const blocked = await app.inject({ method: 'DELETE', url: '/api/devices/no-existe', headers: { authorization: 'Bearer malo' } });
      assert.equal(blocked.statusCode, 429);
      assert.equal(blocked.headers['retry-after'], '60');
      assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
    });
  });
});

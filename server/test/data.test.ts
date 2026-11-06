import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';

const dir = mkdtempSync(join(tmpdir(), 'packs-'));
writeFileSync(join(dir, 'UY.json'), JSON.stringify({ country: 'UY', generatedAt: '2026-12-01' }));
writeFileSync(join(dir, 'secreto.json'), '{"x":1}');
after(() => rmSync(dir, { recursive: true, force: true }));

const app = () => buildApp({ ...loadConfig({}), dataPacksDir: dir }, openDb(':memory:'), { publicKey: 'k', send: async () => true }, false);

describe('paquetes de datos regenerados (GET /api/data/:file)', () => {
  it('sirve los archivos de la lista, sin cache', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/data/UY.json' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().generatedAt, '2026-12-01');
    assert.equal(res.headers['cache-control'], 'no-cache');
  });
  it('404 si todavía no se generó o si no está en la lista (nada de rutas arbitrarias)', async () => {
    const a = await app();
    assert.equal((await a.inject({ method: 'GET', url: '/api/data/CL.json' })).statusCode, 404);
    assert.equal((await a.inject({ method: 'GET', url: '/api/data/secreto.json' })).statusCode, 404);
    assert.equal((await a.inject({ method: 'GET', url: '/api/data/..%2Fdb.sqlite' })).statusCode, 404);
  });
});

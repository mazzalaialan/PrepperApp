import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';

const dir = mkdtempSync(join(tmpdir(), 'vikarg-library-'));
after(() => rmSync(dir, { recursive: true, force: true }));

before(() => {
  mkdirSync(join(dir, 'books'));
  writeFileSync(join(dir, 'books', 'libre.zip'), 'ZIP-LIBRE');
  writeFileSync(join(dir, 'books', 'privado.zip'), 'ZIP-PRIVADO');
  writeFileSync(
    join(dir, 'catalog.json'),
    JSON.stringify({
      generatedAt: '2026-11-05T00:00:00Z',
      categories: [
        {
          id: 'cabuyeria',
          name: 'Cabuyería',
          books: [
            { id: 'libre', title: 'FM 3-97.61', license: 'public', key: 'interno' },
            { id: 'privado', title: 'Enciclopedia de nudos', license: 'private', key: 'interno' },
          ],
        },
      ],
    }),
  );
});

async function app(key: string | null = 'VikArg') {
  return buildApp({ ...loadConfig({}), libraryDir: dir, libraryKey: key }, openDb(':memory:'), { publicKey: 'k', send: async () => true }, false);
}

describe('biblioteca', () => {
  it('el catálogo muestra los libres y los con derechos, sin datos internos', async () => {
    const a = await app();
    const res = await a.inject({ url: '/api/library' });
    const c = res.json();
    assert.equal(c.privateAvailable, true);
    assert.deepEqual(
      c.categories[0].books.map((b: { id: string; license: string }) => [b.id, b.license]),
      [
        ['libre', 'public'],
        ['privado', 'private'],
      ],
    );
    assert.equal(c.categories[0].books[0].key, undefined);
    await a.close();
  });

  it('el libre se baja sin clave; el con derechos solo con la clave', async () => {
    const a = await app();
    const libre = await a.inject({ url: '/api/library/books/libre' });
    assert.equal(libre.statusCode, 200);
    assert.equal(libre.body, 'ZIP-LIBRE');
    assert.equal(libre.headers['content-type'], 'application/zip');
    assert.equal((await a.inject({ url: '/api/library/books/privado' })).statusCode, 403);
    assert.equal((await a.inject({ url: '/api/library/books/privado', headers: { 'x-library-key': 'otra' } })).statusCode, 403);
    const ok = await a.inject({ url: '/api/library/books/privado', headers: { 'x-library-key': 'VikArg' } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body, 'ZIP-PRIVADO');
    assert.equal(ok.headers['cache-control'], 'private, no-store');
    assert.equal((await a.inject({ url: '/api/library/books/../../etc/passwd' })).statusCode, 404);
    await a.close();
  });

  it('comprobar la clave, con límite de intentos', async () => {
    const a = await app();
    assert.equal((await a.inject({ method: 'POST', url: '/api/library/key', payload: { key: 'VikArg' } })).statusCode, 204);
    for (let i = 0; i < 10; i++) assert.equal((await a.inject({ method: 'POST', url: '/api/library/key', payload: { key: `mala${i}` } })).statusCode, 403);
    const blocked = await a.inject({ method: 'POST', url: '/api/library/key', payload: { key: 'VikArg' } });
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    await a.close();
  });

  it('sin clave configurada, los con derechos no se entregan a nadie', async () => {
    const a = await app(null);
    assert.equal((await a.inject({ url: '/api/library' })).json().privateAvailable, false);
    assert.equal((await a.inject({ url: '/api/library/books/privado', headers: { 'x-library-key': 'VikArg' } })).statusCode, 403);
    assert.equal((await a.inject({ url: '/api/library/books/libre' })).statusCode, 200);
    await a.close();
  });
});

import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';

/**
 * Biblioteca (ARQUITECTURA §11): los paquetes que arma
 * tools/library-builder (`catalog.json` y un ZIP por libro).
 *
 * - `GET /api/library`: el catálogo completo (libres y con derechos: la app
 *   muestra todos) y si este servidor tiene clave para los con derechos.
 * - `POST /api/library/key`: comprueba la clave (204 o 403).
 * - `GET /api/library/books/:id`: el ZIP. Los libres, a cualquiera; los con
 *   derechos, solo con la clave en `x-library-key`: son para uso personal y
 *   no se redistribuyen.
 */

interface CatalogBook {
  id: string;
  license: 'public' | 'private';
  key?: string;
  [k: string]: unknown;
}

interface Catalog {
  generatedAt: string;
  categories: { id: string; name: string; books: CatalogBook[] }[];
}

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Intentos de clave por IP antes de bloquear un rato (contra la adivinación). */
const MAX_TRIES = 10;
const TRY_WINDOW_MS = 10 * 60_000;

export function libraryRoutes(app: FastifyInstance, config: Config): void {
  const dir = config.libraryDir;
  let cached: { mtimeMs: number; catalog: Catalog; byId: Map<string, CatalogBook> } | null = null;
  const tries = new Map<string, { count: number; since: number }>();

  async function catalog(): Promise<typeof cached> {
    if (!dir) return null;
    const path = join(dir, 'catalog.json');
    try {
      const s = await stat(path);
      if (cached && cached.mtimeMs === s.mtimeMs) return cached;
      const raw = JSON.parse(await readFile(path, 'utf8')) as Catalog;
      // El campo interno del conversor no viaja.
      for (const c of raw.categories) for (const b of c.books) delete b.key;
      cached = { mtimeMs: s.mtimeMs, catalog: raw, byId: new Map(raw.categories.flatMap((c) => c.books.map((b) => [b.id, b]))) };
      return cached;
    } catch {
      return null;
    }
  }

  /** null: sin intentos de más; si no, segundos para reintentar. */
  function throttled(req: FastifyRequest): number | null {
    const now = Date.now();
    const t = tries.get(req.ip);
    if (!t || now - t.since > TRY_WINDOW_MS) return null;
    return t.count >= MAX_TRIES ? Math.ceil((t.since + TRY_WINDOW_MS - now) / 1000) : null;
  }

  function keyOk(req: FastifyRequest, given: string | undefined): boolean {
    if (!config.libraryKey || !given) return false;
    const ok = timingSafeEqual(sha(given), sha(config.libraryKey));
    if (!ok) {
      const now = Date.now();
      const t = tries.get(req.ip);
      tries.set(req.ip, t && now - t.since <= TRY_WINDOW_MS ? { count: t.count + 1, since: t.since } : { count: 1, since: now });
    }
    return ok;
  }

  app.get('/api/library', async (_req, reply) => {
    const c = await catalog();
    if (!c) return reply.code(404).send({ error: 'no_library' });
    reply.header('cache-control', 'no-cache');
    return { ...c.catalog, privateAvailable: !!config.libraryKey };
  });

  app.post<{ Body: { key: string } }>(
    '/api/library/key',
    { schema: { body: { type: 'object', required: ['key'], properties: { key: { type: 'string', maxLength: 200 } } } } },
    async (req, reply) => {
      const wait = throttled(req);
      if (wait !== null) return reply.header('retry-after', String(wait)).code(429).send({ error: 'too_many_tries' });
      return keyOk(req, req.body.key) ? reply.code(204).send() : reply.code(403).send({ error: 'bad_key' });
    },
  );

  app.get<{ Params: { id: string } }>('/api/library/books/:id', async (req, reply) => {
    const c = await catalog();
    const id = req.params.id.replace(/\.zip$/, '');
    const book = c?.byId.get(id);
    if (!dir || !book || !/^[a-z0-9-]+$/.test(id)) return reply.code(404).send({ error: 'not_found' });
    if (book.license !== 'public') {
      const wait = throttled(req);
      if (wait !== null) return reply.header('retry-after', String(wait)).code(429).send({ error: 'too_many_tries' });
      const header = req.headers['x-library-key'];
      if (!keyOk(req, Array.isArray(header) ? header[0] : header)) return reply.code(403).send({ error: 'key_required' });
    }
    const path = join(dir, 'books', `${id}.zip`);
    try {
      const s = await stat(path);
      reply.header('content-type', 'application/zip');
      reply.header('content-length', String(s.size));
      // Los libres se pueden guardar en cachés intermedias; los con derechos, no.
      reply.header('cache-control', book.license === 'public' ? 'public, max-age=86400' : 'private, no-store');
      return reply.send(createReadStream(path));
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });
}

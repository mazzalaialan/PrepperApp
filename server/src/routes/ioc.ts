import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import { fetchIocLevels, type IocLevels } from '../ioc/levels.ts';

/**
 * `GET /api/ioc/:code`: último nivel medido de un mareógrafo del IOC (ver ioc/levels.ts). Solo atiende las estaciones del catálogo
 * (app/public/data/ioc-stations.json) para no ser un proxy abierto, y guarda cada respuesta 5 minutos. Sin `IOC_API_KEY`, responde 404.
 */
const FRESH_MS = 5 * 60_000;
const STALE_MS = 6 * 3_600_000;

export interface IocSource {
  fetch: (code: string, apiKey: string) => Promise<IocLevels>;
}

export function iocRoutes(app: FastifyInstance, config: Config, source: IocSource = { fetch: (c, k) => fetchIocLevels(c, k) }, now: () => number = Date.now): void {
  const cache = new Map<string, IocLevels>();
  const inflight = new Map<string, Promise<IocLevels>>();
  let codes: Set<string> | null = null;

  function catalog(): Set<string> {
    if (!codes) {
      if (!config.appDir) throw new Error('sin catálogo de mareógrafos');
      codes = new Set((JSON.parse(readFileSync(`${config.appDir}/data/ioc-stations.json`, 'utf8')) as { stations: { code: string }[] }).stations.map((s) => s.code));
    }
    return codes;
  }

  app.get<{ Params: { code: string } }>('/api/ioc/:code', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const key = config.iocApiKey;
    if (!key) return reply.code(404).send({ error: 'disabled' });
    const { code } = req.params;
    let known: boolean;
    try {
      known = catalog().has(code);
    } catch {
      return reply.code(503).send({ error: 'unavailable' });
    }
    if (!known) return reply.code(404).send({ error: 'unknown' });
    const hit = cache.get(code);
    if (hit && now() - hit.fetchedAt < FRESH_MS) return { ...hit, stale: false };
    try {
      let p = inflight.get(code);
      if (!p) {
        p = source.fetch(code, key).finally(() => inflight.delete(code));
        inflight.set(code, p);
      }
      const fresh = await p;
      cache.set(code, fresh);
      return { ...fresh, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err), code }, 'no se pudo leer el mareógrafo del IOC');
      if (hit && now() - hit.fetchedAt < STALE_MS) return { ...hit, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });
}

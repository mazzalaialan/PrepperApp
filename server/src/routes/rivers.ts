import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import { fetchBoLevels, type BoLevels } from '../rivers/bo.ts';

/**
 * Niveles de los ríos de Bolivia (SENAMHI Bolivia): `GET /api/rivers/bo`. El reporte es un PDF diario: el servidor lo baja y lo lee solo
 * cuando alguien lo pide y el último tiene más de 3 horas, y si falla devuelve el último bueno (hasta 7 días) marcado como viejo.
 * Catálogo de estaciones con coordenadas: app/public/data/rivers-BO.json (tools/river-data/bolivia.mjs).
 */
const FRESH_MS = 3 * 3_600_000;
const STALE_MS = 7 * 86_400_000;

export interface BoSource {
  fetch: (stations: { name: string }[]) => Promise<BoLevels>;
}

export function riversRoutes(app: FastifyInstance, config: Config, source: BoSource = { fetch: fetchBoLevels }, now: () => number = Date.now): void {
  let last: BoLevels | null = null;
  let inflight: Promise<BoLevels> | null = null;
  let stations: { name: string }[] | null = null;

  function catalog(): { name: string }[] {
    if (!stations) {
      if (!config.appDir) throw new Error('sin catálogo de estaciones de Bolivia');
      stations = (JSON.parse(readFileSync(`${config.appDir}/data/rivers-BO.json`, 'utf8')) as { stations: { name: string }[] }).stations;
    }
    return stations;
  }

  app.get('/api/rivers/bo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (last && now() - last.fetchedAt < FRESH_MS) return { ...last, stale: false };
    try {
      inflight ??= source.fetch(catalog()).finally(() => (inflight = null));
      last = await inflight;
      return { ...last, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudo leer el reporte de niveles de Bolivia');
      if (last && now() - last.fetchedAt < STALE_MS) return { ...last, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });
}

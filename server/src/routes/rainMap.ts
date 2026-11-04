import type { FastifyInstance } from 'fastify';
import { MAP_BOUNDS, type RainMapStore } from '../rain/map.ts';

/**
 * Lluvia estimada para el mapa de la app: `/api/rain/map` dice de cuándo es y
 * dónde va la imagen; `/api/rain/map.png` es la imagen (transparente donde no
 * llueve). Pedir el mapa despierta la tarea que la arma. Sin token: son
 * datos públicos del satélite.
 */
export function rainMapRoutes(app: FastifyInstance, store: RainMapStore, onWake: () => void): void {
  app.get('/api/rain/map', async (_req, reply) => {
    const idle = Date.now() - store.requestedAt > 5 * 60_000;
    store.requestedAt = Date.now();
    if (idle) onWake();
    reply.header('cache-control', 'no-store');
    return {
      at: store.at ? new Date(store.at).toISOString() : null,
      bounds: MAP_BOUNDS,
      // La hora en la dirección: cada imagen nueva tiene otra y no se confunde con la guardada.
      image: store.at ? `/api/rain/map.png?t=${store.at}` : null,
    };
  });
  app.get('/api/rain/map.png', async (_req, reply) => {
    if (!store.png) return reply.code(404).send({ error: 'not-ready' });
    reply.header('cache-control', 'public, max-age=3600').type('image/png');
    return reply.send(store.png);
  });
}

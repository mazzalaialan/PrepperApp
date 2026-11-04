import type { FastifyInstance } from 'fastify';
import type { LightningStore } from '../lightning/store.ts';

/**
 * Rayos recientes de la región (GOES-19 GLM, dominio público) para el mapa:
 * `[lat, lon, segundos desde el rayo]`, con 3 decimales (~100 m: el satélite
 * tiene ~8 km de error). Sin token: son datos públicos.
 */
export function lightningRoutes(app: FastifyInstance, store: LightningStore, onWake: () => void): void {
  app.get('/api/lightning', async (_req, reply) => {
    const now = Date.now();
    const idle = now - store.requestedAt > 2 * 60_000;
    store.requestedAt = now;
    // Si nadie lo miraba, el servidor no estaba bajando rayos: arranca ya.
    if (idle) onWake();
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    reply.header('cache-control', 'no-store');
    return {
      updatedAt: store.updatedAt ? new Date(store.updatedAt).toISOString() : null,
      flashes: store.flashes.map((f) => [r3(f.lat), r3(f.lon), Math.max(0, Math.round((now - f.at) / 1000))]),
    };
  });
}

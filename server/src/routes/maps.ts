import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { MapKind, MapsService } from '../maps/service.ts';

/**
 * Mapas offline desde el servidor propio.
 *
 * - `GET /api/maps`: qué tiene el servidor (zooms y zona de cada archivo) y
 *   el tamaño máximo de zona que deja bajar de una vez.
 * - `GET /api/maps/{vector|elevation}/z/x/y`: una tesela. 204 si no hay
 *   datos ahí (mar, fuera de la zona del archivo).
 *
 * Si hay demasiados pedidos a la vez responde 503 con Retry-After: la app
 * entonces baja de las fuentes públicas por un rato (ver
 * app/src/modules/maps/sources.ts).
 */
export function mapRoutes(app: FastifyInstance, maps: MapsService, config: Config) {
  let inFlight = 0;

  app.get('/api/maps', async () => {
    const [vector, elevation] = await Promise.all([maps.summary('vector'), maps.summary('elevation')]);
    return { vector, elevation, maxZoneTiles: config.mapsMaxZoneTiles, maxZoneMb: config.mapsMaxZoneMb };
  });

  app.get<{ Params: { kind: string; z: string; x: string; y: string } }>('/api/maps/:kind/:z/:x/:y', async (req, reply) => {
    const { kind } = req.params;
    if (kind !== 'vector' && kind !== 'elevation') return reply.code(404).send({ error: 'not_found' });
    const [z, x, y] = [req.params.z, req.params.x, req.params.y.replace(/\.\w+$/, '')].map(Number);
    if (![z, x, y].every((n) => Number.isInteger(n) && n! >= 0) || z! > 22) return reply.code(400).send({ error: 'bad_tile' });
    if (inFlight >= config.mapsMaxConcurrent) {
      reply.header('retry-after', '30');
      return reply.code(503).send({ error: 'busy' });
    }
    inFlight++;
    try {
      const summary = await maps.summary(kind as MapKind);
      if (!summary) return reply.code(404).send({ error: 'no_map' });
      const tile = await maps.tile(kind as MapKind, z!, x!, y!);
      reply.header('cache-control', 'public, max-age=604800');
      if (!tile || tile.data.length === 0) return reply.code(204).send();
      if (tile.encoding) reply.header('content-encoding', tile.encoding);
      reply.header('content-type', kind === 'vector' ? 'application/x-protobuf' : 'image/png');
      return reply.send(tile.data);
    } finally {
      inFlight--;
    }
  });
}

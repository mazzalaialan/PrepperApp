import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';

/**
 * Paquetes de datos regenerados por el servidor cada mes
 * (server/src/data/update-data.sh): `GET /api/data/:file`. La app usa la copia
 * del servidor si es más nueva que la que trae (campo `generatedAt`).
 * Solo estos archivos: nada de rutas arbitrarias.
 */
export const DATA_FILES = new Set(['CL.json', 'UY.json', 'parks-CL.json', 'parks-AR.json']);

export function dataRoutes(app: FastifyInstance, config: Config): void {
  app.get<{ Params: { file: string } }>('/api/data/:file', async (req, reply) => {
    const { file } = req.params;
    if (!config.dataPacksDir || !DATA_FILES.has(file)) return reply.code(404).send({ error: 'not-found' });
    let body: Buffer;
    try {
      body = await readFile(join(config.dataPacksDir, file));
    } catch {
      return reply.code(404).send({ error: 'not-found' });
    }
    return reply.header('content-type', 'application/json; charset=utf-8').header('cache-control', 'no-cache').send(body);
  });
}

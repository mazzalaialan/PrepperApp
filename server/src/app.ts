import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import type { PushSender } from './push.ts';
import { createLightningStore, type LightningStore } from './lightning/store.ts';
import { deviceRoutes } from './routes/devices.ts';
import { lightningRoutes } from './routes/lightning.ts';
import { transferRoutes } from './routes/transfers.ts';

export const VERSION = '0.1.0';

export async function buildApp(
  config: Config,
  db: Db,
  push: PushSender,
  logger = true,
  lightning: { store: LightningStore; wake: () => void } = { store: createLightningStore(), wake: () => undefined },
): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: true });

  await app.register(cors, { origin: config.allowedOrigins === '*' ? true : config.allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] });

  app.get('/api/health', async () => ({ ok: true, version: VERSION, vapidPublicKey: push.publicKey }));
  deviceRoutes(app, db, push);
  transferRoutes(app, db, config);
  lightningRoutes(app, lightning.store, lightning.wake);

  // Opcional: servir la propia PWA para una instalación 100% autónoma.
  if (config.appDir) {
    const root = resolve(config.appDir);
    if (!existsSync(root)) throw new Error(`APP_DIR no existe: ${root}`);
    await app.register(fastifyStatic, { root, wildcard: true });
  }

  return app;
}

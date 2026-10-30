import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { createPushSender } from './push.ts';
import { runScheduler } from './scheduler.ts';

const config = loadConfig();
const db = openDb(config.dataDir);
const push = createPushSender(db, config.vapidSubject);
const app = await buildApp(config, db, push);

async function tick() {
  try {
    const { sent, removed } = await runScheduler(db, push);
    if (sent || removed) app.log.info({ sent, removed }, 'notificaciones enviadas');
  } catch (err) {
    app.log.error(err, 'falló el envío de notificaciones');
  }
}

const timer = setInterval(() => void tick(), config.schedulerIntervalMs);
void tick();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

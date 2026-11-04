import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { createPushSender } from './push.ts';
import { runRainWatch } from './rain/watch.ts';
import { openMeteoSource } from './rain/source.ts';
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

const rainSource = openMeteoSource(config.weatherUrl);

async function rainTick() {
  try {
    const { sent, removed } = await runRainWatch(db, push, rainSource, new Date(), config.rainHereMaxAgeMs);
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de lluvia enviados');
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de lluvia');
  }
}

const timer = setInterval(() => void tick(), config.schedulerIntervalMs);
const rainTimer = setInterval(() => void rainTick(), config.rainIntervalMs);
void tick();
void rainTick();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    clearInterval(rainTimer);
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

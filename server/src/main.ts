import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { createPushSender } from './push.ts';
import { glmFeed } from './lightning/glm.ts';
import { readGlmPartial } from './lightning/partial.ts';
import { hasPlaces, LIGHTNING_DEFAULTS, runLightningWatch } from './lightning/watch.ts';
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

const glm = glmFeed({ maxFiles: config.lightningFilesPerPoll, partial: config.lightningPartial ? readGlmPartial : null });
let lightningLoggedAt = 0;
let lightningBusy = false;

async function lightningTick() {
  // Una pasada a la vez (bajar y leer puede tardar más que el intervalo con mala conexión).
  if (lightningBusy || !hasPlaces(db)) return;
  lightningBusy = true;
  try {
    const flashes = await glm.poll(new Date());
    const { sent, removed } = await runLightningWatch(db, push, flashes, new Date(), {
      ...LIGHTNING_DEFAULTS,
      radiusKm: config.lightningRadiusKm,
      hereMaxAgeMs: config.rainHereMaxAgeMs,
    });
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de rayos enviados');
    // Una vez por hora, cuánto se bajó del satélite.
    if (Date.now() - lightningLoggedAt > 3_600_000) {
      lightningLoggedAt = Date.now();
      app.log.info(glm.stats(), 'rayos: archivos leídos y bytes bajados desde el arranque');
    }
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de rayos');
  } finally {
    lightningBusy = false;
  }
}

const timer = setInterval(() => void tick(), config.schedulerIntervalMs);
const lightningTimer = config.lightningEnabled ? setInterval(() => void lightningTick(), config.lightningIntervalMs) : undefined;
const rainTimer = setInterval(() => void rainTick(), config.rainIntervalMs);
void tick();
void rainTick();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    clearInterval(rainTimer);
    clearInterval(lightningTimer);
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

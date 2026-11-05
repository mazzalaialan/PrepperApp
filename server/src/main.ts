import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { createPushSender } from './push.ts';
import { glmFeed } from './lightning/glm.ts';
import { readGlmPartial } from './satellite/partial.ts';
import { createLightningStore, mapActive } from './lightning/store.ts';
import { hasPlaces, LIGHTNING_DEFAULTS, runLightningWatch } from './lightning/watch.ts';
import { checkObservedRain, createObservedRainStatus } from './rain/noaaWatch.ts';
import { runRainWatch } from './rain/watch.ts';
import { createRainMapStore, RAIN_MAP_ACTIVE_MS, updateRainMap } from './rain/map.ts';
import { irObserver, withObservedRain } from './rain/observer.ts';
import { openMeteoSource } from './rain/source.ts';
import { runScheduler } from './scheduler.ts';
import { fetchGdacs, fetchQuakes, type HazardEvent } from './hazards/sources.ts';
import { HAZARD_DEFAULTS, runHazardWatch } from './hazards/watch.ts';
import { openMeteoGarden, runGardenWatch } from './garden/watch.ts';

const config = loadConfig();
const db = openDb(config.dataDir);
const push = createPushSender(db, config.vapidSubject);
const lightningStore = createLightningStore();
// `lightningTick` se define más abajo; la ruta solo lo despierta.
const observedRain = createObservedRainStatus();
const rainMapStore = createRainMapStore();
const app = await buildApp(
  config,
  db,
  push,
  true,
  { store: lightningStore, wake: () => void lightningTick() },
  observedRain,
  { store: rainMapStore, wake: () => void rainMapTick() },
);

async function tick() {
  try {
    const { sent, removed } = await runScheduler(db, push);
    if (sent || removed) app.log.info({ sent, removed }, 'notificaciones enviadas');
  } catch (err) {
    app.log.error(err, 'falló el envío de notificaciones');
  }
}

const forecastSource = openMeteoSource(config.weatherUrl);
const observer = irObserver();
const rainSource = config.rainObserved ? withObservedRain(forecastSource, observer) : forecastSource;

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
  if (!config.lightningEnabled || lightningBusy || (!hasPlaces(db) && !mapActive(lightningStore))) return;
  lightningBusy = true;
  try {
    const filesBefore = glm.stats().files;
    const flashes = await glm.poll(new Date());
    // Para el mapa: la tanda nueva reemplaza a la anterior, aunque venga vacía; si no hubo archivos nuevos, queda la última.
    if (glm.stats().files > filesBefore) {
      lightningStore.flashes = flashes;
      lightningStore.updatedAt = Date.now();
    }
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

async function observedRainTick() {
  try {
    observedRain.available = await checkObservedRain();
    observedRain.checkedAt = new Date().toISOString();
    if (observedRain.available.length) app.log.warn({ available: observedRain.available }, 'NOAA publicó lluvia estimada en el bucket abierto: se puede sumar como fuente');
  } catch (err) {
    app.log.error(err, 'no se pudo revisar la lluvia estimada de NOAA');
  }
}

let rainMapBusy = false;
let rainMapBytes = 0;

/** Mapa de lluvia estimada: solo mientras alguien lo mira (~5,4 MB por archivo nuevo, cada 10 min). */
async function rainMapTick() {
  if (!config.rainObserved || rainMapBusy || Date.now() - rainMapStore.requestedAt > RAIN_MAP_ACTIVE_MS) return;
  rainMapBusy = true;
  try {
    const done = await updateRainMap(rainMapStore);
    if (done) {
      rainMapBytes += done.bytes;
      app.log.info({ bytes: done.bytes, total: rainMapBytes }, 'mapa de lluvia estimada actualizado');
    }
  } catch (err) {
    app.log.error(err, 'falló el mapa de lluvia estimada');
  } finally {
    rainMapBusy = false;
  }
}

// Peligros naturales: sismos cada 5 minutos y GDACS cada 30 (cambia despacio), solo si hay lugares con aviso.
let gdacsEvents: HazardEvent[] = [];
let gdacsAt = 0;
async function hazardTick() {
  if (!config.hazardsEnabled || !hasPlaces(db)) return;
  try {
    const quakes = await fetchQuakes().catch((err) => {
      app.log.warn(err, 'no se pudieron leer los sismos de USGS');
      return [];
    });
    if (Date.now() - gdacsAt > 30 * 60_000) {
      try {
        gdacsEvents = await fetchGdacs();
        gdacsAt = Date.now();
      } catch (err) {
        app.log.warn(err, 'no se pudieron leer los eventos de GDACS');
      }
    }
    const { sent, removed } = await runHazardWatch(db, push, [...quakes, ...gdacsEvents], new Date(), { ...HAZARD_DEFAULTS, hereMaxAgeMs: config.rainHereMaxAgeMs });
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de peligros naturales enviados');
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de peligros naturales');
  }
}
const hazardTimer = setInterval(() => void hazardTick(), 5 * 60_000);

const gardenWeather = openMeteoGarden(config.weatherUrl);
async function gardenTick() {
  try {
    const { sent, removed } = await runGardenWatch(db, push, gardenWeather);
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de la huerta enviados');
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de la huerta');
  }
}
// Cada 15 minutos: la helada se avisa a partir de las 17 y el riego y las tareas a la hora de aviso de cada uno.
const gardenTimer = setInterval(() => void gardenTick(), 15 * 60_000);
setTimeout(() => void hazardTick(), 30_000);

const timer = setInterval(() => void tick(), config.schedulerIntervalMs);
const rainMapTimer = setInterval(() => void rainMapTick(), 2 * 60_000);
const observedRainTimer = setInterval(() => void observedRainTick(), 24 * 3_600_000);
void observedRainTick();
const lightningTimer = config.lightningEnabled ? setInterval(() => void lightningTick(), config.lightningIntervalMs) : undefined;
const rainTimer = setInterval(() => void rainTick(), config.rainIntervalMs);
void tick();
void rainTick();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    clearInterval(rainTimer);
    clearInterval(rainMapTimer);
    clearInterval(observedRainTimer);
    clearInterval(lightningTimer);
    clearInterval(hazardTimer);
    clearInterval(gardenTimer);
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

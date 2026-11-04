/** Configuración por variables de entorno (ver docs/SERVIDOR.md). */
export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Orígenes permitidos para CORS; '*' = cualquiera (la autenticación es por token, no por cookies). */
  allowedOrigins: string[] | '*';
  /** Contacto que exige el protocolo Web Push (mailto: o https:). */
  vapidSubject: string;
  transferMaxBytes: number;
  transferTtlMs: number;
  /** Carpeta con el build de la PWA para servirla desde acá; vacío = no servirla. */
  appDir: string | null;
  /** Cada cuánto revisar si hay notificaciones para enviar. */
  schedulerIntervalMs: number;
  /** Pronóstico para los avisos de lluvia (API compatible con Open-Meteo). */
  weatherUrl: string;
  /** Cada cuánto revisar la lluvia en los lugares con aviso. */
  rainIntervalMs: number;
  /** Hasta qué antigüedad se usa la última ubicación conocida de "donde estoy". */
  rainHereMaxAgeMs: number;
  /** Avisos de rayos (GOES-19 GLM): se bajan archivos del satélite solo si hay lugares con aviso. */
  lightningEnabled: boolean;
  lightningIntervalMs: number;
  /** Archivos de 20 s que se leen por pasada (3 = todos, con intervalo de 60 s). */
  lightningFilesPerPoll: number;
  /** Bajar solo las coordenadas de los rayos de cada archivo (~36 KB) en vez del archivo completo (~380 KB). */
  lightningPartial: boolean;
  lightningRadiusKm: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origins = env.ALLOWED_ORIGINS?.trim() || '*';
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '0.0.0.0',
    dataDir: env.DATA_DIR ?? './data',
    allowedOrigins: origins === '*' ? '*' : origins.split(',').map((o) => o.trim()),
    vapidSubject: env.VAPID_SUBJECT ?? 'mailto:admin@localhost',
    transferMaxBytes: Number(env.TRANSFER_MAX_MB ?? 50) * 1024 * 1024,
    transferTtlMs: Number(env.TRANSFER_TTL_HOURS ?? 24) * 3_600_000,
    appDir: env.APP_DIR?.trim() || null,
    schedulerIntervalMs: Number(env.SCHEDULER_INTERVAL_MINUTES ?? 10) * 60_000,
    weatherUrl: env.WEATHER_URL?.trim() || 'https://api.open-meteo.com',
    rainIntervalMs: Number(env.RAIN_INTERVAL_MINUTES ?? 15) * 60_000,
    rainHereMaxAgeMs: Number(env.RAIN_HERE_MAX_AGE_HOURS ?? 24) * 3_600_000,
    lightningEnabled: (env.LIGHTNING_ENABLED ?? 'true') !== 'false',
    lightningIntervalMs: Number(env.LIGHTNING_INTERVAL_SECONDS ?? 60) * 1000,
    lightningFilesPerPoll: Number(env.LIGHTNING_FILES_PER_POLL ?? 3),
    lightningPartial: (env.LIGHTNING_PARTIAL ?? 'true') !== 'false',
    lightningRadiusKm: Number(env.LIGHTNING_RADIUS_KM ?? 30),
  };
}

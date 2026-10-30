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
  };
}

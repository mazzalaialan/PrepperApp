import type { Db } from '../db.ts';

/**
 * Seguimiento de las fuentes externas (SMN, DMC, INUMET, OAVV, USGS, GDACS,
 * Open-Meteo, GOES): si una falla varias veces seguidas durante un rato, se
 * avisa una vez al administrador (mail al correo de contacto); cuando vuelve a
 * responder, se avisa que volvió. El estado queda en la base para que un
 * reinicio no repita el aviso.
 */

export interface AdminNotifier {
  send(subject: string, text: string): Promise<void>;
}

export interface MonitorOptions {
  /** Fallas seguidas antes de avisar. */
  minFailures: number;
  /** Y además, tiempo mínimo caída (las fuentes se consultan cada 5 a 30 min). */
  minDownMs: number;
  /** Dirección pública del servidor, para el enlace al estado en el mail. */
  publicUrl?: string;
}

export const MONITOR_DEFAULTS: MonitorOptions = { minFailures: 3, minDownMs: 30 * 60_000 };

interface Row {
  failures: number;
  since: number;
  last_error: string | null;
  notified: number;
}

const fmt = (ms: number) => new Date(ms).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

export function createSourceMonitor(db: Db, notifier: AdminNotifier | null, log: (msg: string, data?: object) => void, options: MonitorOptions = MONITOR_DEFAULTS, now = () => Date.now()) {
  const get = db.prepare('SELECT failures, since, last_error, notified FROM source_status WHERE source = ?');
  const upsert = db.prepare(
    `INSERT INTO source_status (source, failures, since, last_error, notified) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET failures = excluded.failures, since = excluded.since, last_error = excluded.last_error, notified = excluded.notified`,
  );
  const clear = db.prepare('DELETE FROM source_status WHERE source = ?');
  const health = options.publicUrl ? `\n\nEstado del servidor: ${options.publicUrl.replace(/\/$/, '')}/api/health` : '';

  async function notify(subject: string, text: string): Promise<boolean> {
    if (!notifier) {
      log('aviso al administrador sin enviar (falta configurar el correo: SMTP_URL)', { subject });
      return true; // queda registrado; no se reintenta en cada vuelta
    }
    try {
      await notifier.send(subject, text + health);
      return true;
    } catch (err) {
      log('no se pudo enviar el aviso al administrador', { subject, err: String(err) });
      return false;
    }
  }

  return {
    /** La fuente respondió bien: si estaba avisada como caída, se avisa que volvió. */
    async ok(source: string, label: string): Promise<void> {
      const row = get.get(source) as Row | undefined;
      if (!row) return;
      clear.run(source);
      if (row.notified) {
        await notify(`VikArg: ${label} volvió a responder`, `${label} vuelve a responder desde ${fmt(now())}.\nEstuvo sin responder desde ${fmt(row.since)} (${row.failures} intentos fallidos).`);
      }
    },
    /** La fuente falló: después de varias fallas seguidas y un rato caída, se avisa una vez. */
    async fail(source: string, label: string, err: unknown): Promise<void> {
      const row = (get.get(source) as Row | undefined) ?? { failures: 0, since: now(), last_error: null, notified: 0 };
      const failures = row.failures + 1;
      const error = String(err instanceof Error ? err.message : err).slice(0, 500);
      let notified = row.notified;
      if (!notified && failures >= options.minFailures && now() - row.since >= options.minDownMs) {
        const sent = await notify(
          `VikArg: ${label} no responde`,
          `${label} no responde desde ${fmt(row.since)} (${failures} intentos seguidos).\nÚltimo error: ${error}\n\nMientras tanto la app muestra lo último que se pudo leer. Te aviso cuando vuelva a responder.`,
        );
        if (sent) notified = 1;
      }
      upsert.run(source, failures, row.since, error, notified);
    },
    /** Fuentes caídas ahora (para /api/health). */
    down(): { source: string; since: string; failures: number }[] {
      return (db.prepare('SELECT source, since, failures FROM source_status ORDER BY since').all() as unknown as { source: string; since: number; failures: number }[]).map((r) => ({
        source: r.source,
        since: new Date(r.since).toISOString(),
        failures: r.failures,
      }));
    },
  };
}

export type SourceMonitor = ReturnType<typeof createSourceMonitor>;

/** Mail por SMTP (nodemailer). Sin SMTP_URL o sin ADMIN_EMAIL no hay mails. */
export async function createMailNotifier(smtpUrl: string | null, to: string | null, from: string | null): Promise<AdminNotifier | null> {
  if (!smtpUrl || !to) return null;
  const { createTransport } = await import('nodemailer');
  const transport = createTransport(smtpUrl);
  const sender = from ?? decodeURIComponent(new URL(smtpUrl).username) ?? to;
  return {
    async send(subject, text) {
      await transport.sendMail({ from: `VikArg <${sender}>`, to, subject, text });
    },
  };
}

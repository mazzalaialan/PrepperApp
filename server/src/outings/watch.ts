import type { Db } from '../db.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';

/**
 * Hora límite de regreso de una salida: la app (con las notificaciones activadas)
 * le avisa al servidor a qué hora tiene que estar de vuelta; si esa hora pasa sin
 * que la app la extienda ni cierre la salida, el servidor le manda un aviso al
 * propio dispositivo aunque la app esté cerrada. Solo se guarda la hora y el texto
 * del aviso (sin integrantes, contactos ni plan B); se borra al cerrar la salida.
 */

/** Cuántas veces se insiste y cada cuánto: la primera al pasar la hora, después cada 30 minutos. */
export const MAX_NOTICES = 3;
export const NOTICE_GAP_MS = 30 * 60_000;
/** Un aviso con tantas horas de vencido ya no sirve: se borra. */
const KEEP_AFTER_MS = 12 * 3_600_000;

interface Row {
  device_id: string;
  outing_id: string;
  return_by: number;
  title: string;
  body: string;
  notified_count: number;
  last_notified: number | null;
  subscription: string;
}

export interface OutingWatchResult {
  sent: number;
  removed: number;
}

export async function runOutingWatch(db: Db, push: PushSender, now = new Date()): Promise<OutingWatchResult> {
  const result: OutingWatchResult = { sent: 0, removed: 0 };
  const t = now.getTime();
  db.prepare('DELETE FROM outing_deadlines WHERE return_by < ?').run(t - KEEP_AFTER_MS);
  const due = db
    .prepare(
      `SELECT o.device_id, o.outing_id, o.return_by, o.title, o.body, o.notified_count, o.last_notified, d.subscription
         FROM outing_deadlines o JOIN devices d ON d.id = o.device_id
        WHERE o.return_by <= ? AND o.notified_count < ?`,
    )
    .all(t, MAX_NOTICES) as unknown as Row[];
  for (const row of due) {
    if (row.last_notified !== null && t - row.last_notified < NOTICE_GAP_MS) continue;
    const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, { type: 'outing', outing: { outingId: row.outing_id, title: row.title, body: row.body } });
    if (!delivered) {
      db.prepare('DELETE FROM devices WHERE id = ?').run(row.device_id);
      result.removed++;
      continue;
    }
    db.prepare('UPDATE outing_deadlines SET notified_count = notified_count + 1, last_notified = ? WHERE device_id = ?').run(t, row.device_id);
    result.sent++;
  }
  return result;
}

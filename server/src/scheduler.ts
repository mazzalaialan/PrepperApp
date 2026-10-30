import type { Db } from './db.ts';
import { selectNotifiable, type NotifiableAlert } from './notifiable.ts';
import type { PushSender, PushSubscriptionJson } from './push.ts';
import { localParts } from './time.ts';

interface DeviceRow {
  id: string;
  subscription: string;
  timezone: string;
  notify_hour: number;
  last_notified_day: string | null;
}

interface AlertRow {
  item_name: string;
  kind: 'expiry' | 'capacity';
  due_date: string | null;
  notify_from: string;
}

export interface SchedulerResult {
  sent: number;
  removed: number;
}

/**
 * Una pasada: a cada dispositivo que ya llegó a su hora de aviso y todavía no
 * fue revisado hoy (en su zona horaria) le envía las alertas nuevas.
 */
export async function runScheduler(db: Db, push: PushSender, now = new Date()): Promise<SchedulerResult> {
  const result: SchedulerResult = { sent: 0, removed: 0 };
  const devices = db.prepare('SELECT id, subscription, timezone, notify_hour, last_notified_day FROM devices').all() as unknown as DeviceRow[];
  const alertsOf = db.prepare('SELECT item_name, kind, due_date, notify_from FROM alerts WHERE device_id = ?');
  const markDay = db.prepare('UPDATE devices SET last_notified_day = ? WHERE id = ?');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');

  for (const device of devices) {
    const { day, hour } = localParts(now, device.timezone);
    if (hour < device.notify_hour || device.last_notified_day === day) continue;

    const alerts: NotifiableAlert[] = (alertsOf.all(device.id) as unknown as AlertRow[]).map((a) => ({
      itemName: a.item_name,
      kind: a.kind,
      dueDate: a.due_date,
      notifyFrom: a.notify_from,
    }));
    const pending = selectNotifiable(alerts, day, device.last_notified_day);

    if (pending.length > 0) {
      const subscription = JSON.parse(device.subscription) as PushSubscriptionJson;
      const delivered = await push.send(subscription, {
        type: 'alerts',
        alerts: pending.map(({ itemName, kind, dueDate }) => ({ itemName, kind, dueDate })),
      });
      if (!delivered) {
        removeDevice.run(device.id);
        result.removed++;
        continue;
      }
      result.sent++;
    }
    // Se marca aunque no haya habido nada que avisar: el día queda revisado.
    markDay.run(day, device.id);
  }

  db.prepare('DELETE FROM transfers WHERE expires_at < ?').run(now.getTime());
  return result;
}

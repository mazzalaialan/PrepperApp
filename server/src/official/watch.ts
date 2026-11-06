import type { Db } from '../db.ts';
import { withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import { covers, severityRank, type OfficialAlert } from './cap.ts';

/**
 * Avisa de las alertas oficiales (SMN, DMC, INUMET) cuya zona incluye un
 * lugar del dispositivo: donde estoy, waypoints con aviso, reservas del
 * inventario y canteros de la huerta. A los que dejaron prendidos los avisos
 * de peligros.
 *
 * Un organismo suele renovar o actualizar una alerta con un archivo nuevo
 * (otro identificador): se agrupan por organismo y fenómeno, y no se vuelve a
 * avisar mientras siga vigente la anterior, salvo que suba la severidad.
 */

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  fix_at: string | null;
  subscription: string;
  kind: 'place' | 'stock' | 'garden';
}

export interface OfficialWatchOptions {
  hereMaxAgeMs: number;
  /** Los avisados se olvidan después de esto (las alertas duran horas o pocos días). */
  keepMs: number;
}

export const OFFICIAL_DEFAULTS: OfficialWatchOptions = { hereMaxAgeMs: 24 * 3_600_000, keepMs: 14 * 24 * 3_600_000 };

const family = (a: OfficialAlert) => `${a.source}:${a.event.toLowerCase()}`;

export async function runOfficialWatch(db: Db, push: PushSender, alerts: OfficialAlert[], now = new Date(), options: OfficialWatchOptions = OFFICIAL_DEFAULTS): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  db.prepare('DELETE FROM official_notices WHERE notified_at < ?').run(now.getTime() - options.keepMs);
  // La ceniza en altura es para la aviación: solo se avisa la que llega al suelo.
  const live = alerts.filter((a) => Date.parse(a.expires) > now.getTime() && (a.source !== 'SIGMET' || a.severity === 'Severe'));
  if (!live.length) return result;

  const places = withoutDuplicateHere(
    db
      .prepare(
        `SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, d.subscription, 'place' AS kind
         FROM rain_places p JOIN devices d ON d.id = p.device_id WHERE d.hazards = 1`,
      )
      .all() as unknown as PlaceRow[],
  ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= options.hereMaxAgeMs);
  const extra = db
    .prepare(
      `SELECT s.device_id, 'stock:' || s.place_id AS place_id, s.label, s.lat, s.lon, NULL AS fix_at, d.subscription, 'stock' AS kind
       FROM stock_places s JOIN devices d ON d.id = s.device_id WHERE d.hazards = 1
       UNION ALL
       SELECT g.device_id, 'garden:' || g.place_id AS place_id, g.label, g.lat, g.lon, NULL AS fix_at, d.subscription, 'garden' AS kind
       FROM garden_places g JOIN devices d ON d.id = g.device_id WHERE d.hazards = 1`,
    )
    .all() as unknown as PlaceRow[];
  const byDevice = new Map<string, PlaceRow[]>();
  for (const r of [...places, ...extra]) byDevice.set(r.device_id, [...(byDevice.get(r.device_id) ?? []), r]);

  const previous = db.prepare('SELECT severity, expires_at FROM official_notices WHERE device_id = ? AND family = ?');
  const mark = db.prepare('INSERT OR REPLACE INTO official_notices (device_id, family, alert_key, severity, expires_at, notified_at) VALUES (?, ?, ?, ?, ?, ?)');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');

  // Las más graves primero: si una misma vuelta trae varias del mismo fenómeno, se avisa la peor.
  const ordered = [...live].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || Date.parse(a.onset) - Date.parse(b.onset));
  for (const [deviceId, rows] of byDevice) {
    for (const a of ordered) {
      const hit = rows.filter((r) => covers(a, r.lat, r.lon));
      if (!hit.length) continue;
      const rank = severityRank(a.severity);
      const expiresAt = Date.parse(a.expires);
      const before = previous.get(deviceId, family(a)) as { severity: number; expires_at: number } | undefined;
      // La anterior sigue vigente (o empalma con esta) y no empeoró: solo se estira.
      if (before && before.expires_at >= Date.parse(a.onset) && before.severity >= rank) {
        if (expiresAt > before.expires_at) mark.run(deviceId, family(a), a.key, before.severity, expiresAt, now.getTime());
        continue;
      }
      // "Donde estoy" primero; después waypoints, reservas y huerta.
      const main = hit.find((r) => r.kind === 'place' && r.label === null) ?? hit[0]!;
      const labels = [...new Set(hit.map((r) => r.label).filter((l): l is string => !!l))];
      const delivered = await push.send(JSON.parse(main.subscription) as PushSubscriptionJson, {
        type: 'official',
        official: {
          key: a.key,
          source: a.source,
          senderName: a.senderName,
          event: a.event,
          headline: a.headline,
          severity: a.severity,
          onset: a.onset,
          expires: a.expires,
          here: hit.some((r) => r.kind === 'place' && r.label === null),
          fixAt: main.fix_at,
          places: labels,
          stock: [...new Set(hit.filter((r) => r.kind === 'stock').map((r) => r.label ?? ''))].filter(Boolean),
          url: a.web,
        },
      });
      if (!delivered) {
        removeDevice.run(deviceId);
        result.removed++;
        break;
      }
      mark.run(deviceId, family(a), a.key, rank, Math.max(expiresAt, before?.expires_at ?? 0), now.getTime());
      result.sent++;
    }
  }
  return result;
}

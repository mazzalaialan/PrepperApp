import type { Db } from '../db.ts';
import { bearingDeg, distanceKm, withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import { radiusFor, severity, type HazardEvent } from './sources.ts';

/**
 * Avisa de peligros naturales cerca de los lugares con aviso (los mismos de
 * lluvia y rayos) a los dispositivos que no lo apagaron. Cada evento se avisa
 * una sola vez por lugar, salvo que empeore (GDACS sube de nivel).
 */

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  fix_at: string | null;
  subscription: string;
}

export interface HazardOptions {
  hereMaxAgeMs: number;
  /** Sismos más viejos que esto no se avisan (al arrancar o con un lugar nuevo). */
  quakeMaxAgeMs: number;
  /** Eventos de GDACS sin cambios hace más que esto, tampoco. */
  gdacsMaxAgeMs: number;
  /** Los avisados se olvidan después de esto. */
  keepMs: number;
}

export const HAZARD_DEFAULTS: HazardOptions = {
  hereMaxAgeMs: 24 * 3_600_000,
  quakeMaxAgeMs: 3 * 3_600_000,
  gdacsMaxAgeMs: 3 * 24 * 3_600_000,
  keepMs: 30 * 24 * 3_600_000,
};

export async function runHazardWatch(db: Db, push: PushSender, events: HazardEvent[], now = new Date(), options: HazardOptions = HAZARD_DEFAULTS): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  db.prepare('DELETE FROM hazard_notices WHERE notified_at < ?').run(now.getTime() - options.keepMs);
  const fresh = events.filter((e) => now.getTime() - e.at <= (e.kind === 'quake' ? options.quakeMaxAgeMs : options.gdacsMaxAgeMs) && radiusFor(e) > 0);
  if (fresh.length === 0) return result;

  const rows = withoutDuplicateHere(
    db
      .prepare(
        `SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, d.subscription
         FROM rain_places p JOIN devices d ON d.id = p.device_id WHERE d.hazards = 1`,
      )
      .all() as unknown as PlaceRow[],
  ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= options.hereMaxAgeMs);

  const previous = db.prepare('SELECT level FROM hazard_notices WHERE device_id = ? AND place_id = ? AND event_key = ?');
  const mark = db.prepare('INSERT OR REPLACE INTO hazard_notices (device_id, place_id, event_key, level, notified_at) VALUES (?, ?, ?, ?, ?)');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  const gone = new Set<string>();

  for (const row of rows) {
    for (const e of fresh) {
      if (gone.has(row.device_id)) break;
      const km = distanceKm(row, e);
      if (km > radiusFor(e)) continue;
      const before = previous.get(row.device_id, row.place_id, e.key) as { level: number } | undefined;
      if (before && before.level >= severity(e)) continue;
      const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, {
        type: 'hazard',
        hazard: {
          placeId: row.place_id,
          label: row.label,
          fixAt: row.fix_at,
          kind: e.kind,
          name: e.name,
          distanceKm: Math.round(km),
          bearing: Math.round(bearingDeg(row, e)) % 360,
          ...(e.magnitude !== undefined ? { magnitude: e.magnitude } : {}),
          ...(e.tsunami ? { tsunami: true } : {}),
          ...(e.level ? { level: e.level } : {}),
          url: e.url,
        },
      });
      if (!delivered) {
        removeDevice.run(row.device_id);
        gone.add(row.device_id);
        result.removed++;
        break;
      }
      mark.run(row.device_id, row.place_id, e.key, severity(e), now.getTime());
      result.sent++;
    }
  }
  return result;
}

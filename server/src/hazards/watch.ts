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
  /** Lugar donde hay reserva del inventario (no un lugar de aviso de lluvia). */
  stock: number;
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

  const rainRows = withoutDuplicateHere(
    db
      .prepare(
        `SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, d.subscription, 0 AS stock
         FROM rain_places p JOIN devices d ON d.id = p.device_id WHERE d.hazards = 1`,
      )
      .all() as unknown as PlaceRow[],
  ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= options.hereMaxAgeMs);
  const stockRows = db
    .prepare(
      `SELECT s.device_id, 'stock:' || s.place_id AS place_id, s.label, s.lat, s.lon, NULL AS fix_at, d.subscription, 1 AS stock
       FROM stock_places s JOIN devices d ON d.id = s.device_id WHERE d.hazards = 1`,
    )
    .all() as unknown as PlaceRow[];
  const byDevice = new Map<string, PlaceRow[]>();
  for (const r of [...rainRows, ...stockRows]) byDevice.set(r.device_id, [...(byDevice.get(r.device_id) ?? []), r]);

  const previous = db.prepare('SELECT level FROM hazard_notices WHERE device_id = ? AND place_id = ? AND event_key = ?');
  const mark = db.prepare('INSERT OR REPLACE INTO hazard_notices (device_id, place_id, event_key, level, notified_at) VALUES (?, ?, ?, ?, ?)');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');

  // Un solo aviso por evento y dispositivo, aunque toque varios lugares (donde estoy, waypoints, reservas):
  // se nombra el más cercano y se dice si hay reserva cerca.
  for (const [deviceId, rows] of byDevice) {
    for (const e of fresh) {
      const hit = rows
        .map((row) => ({ row, km: distanceKm(row, e) }))
        .filter(({ row, km }) => {
          if (km > radiusFor(e)) return false;
          const before = previous.get(deviceId, row.place_id, e.key) as { level: number } | undefined;
          return !before || before.level < severity(e);
        })
        .sort((a, b) => a.km - b.km);
      if (!hit.length) continue;
      const { row, km } = hit[0]!;
      const stock = [...new Set(hit.filter((h) => h.row.stock).map((h) => h.row.label ?? ''))].filter(Boolean);
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
          ...(stock.length ? { stock } : {}),
          url: e.url,
        },
      });
      if (!delivered) {
        removeDevice.run(deviceId);
        result.removed++;
        break;
      }
      for (const h of hit) mark.run(deviceId, h.row.place_id, e.key, severity(e), now.getTime());
      result.sent++;
    }
  }
  return result;
}

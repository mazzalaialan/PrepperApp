import type { Db } from '../db.ts';
import { bearingDeg, distanceKm, withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import { volcanoRadiusKm, volcanoRank, type VolcanoAlert } from './oavv.ts';

/**
 * Avisa cuando un volcán con alerta técnica (OAVV) está cerca de un lugar del
 * dispositivo: amarilla a menos de 30 km, naranja a 100 km y roja a 300 km.
 * Una vez por volcán y lugar, y otra vez si sube de nivel (en hazard_notices).
 */

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  fix_at: string | null;
  subscription: string;
  stock: number;
}

export async function runVolcanoWatch(db: Db, push: PushSender, volcanoes: VolcanoAlert[], now = new Date(), hereMaxAgeMs = 24 * 3_600_000): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  const active = volcanoes.filter((v) => volcanoRadiusKm(v.level) > 0);
  if (!active.length) return result;
  const rows = [
    ...withoutDuplicateHere(
      db
        .prepare(`SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, d.subscription, 0 AS stock FROM rain_places p JOIN devices d ON d.id = p.device_id WHERE d.hazards = 1`)
        .all() as unknown as PlaceRow[],
    ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= hereMaxAgeMs),
    ...(db
      .prepare(
        `SELECT s.device_id, 'stock:' || s.place_id AS place_id, s.label, s.lat, s.lon, NULL AS fix_at, d.subscription, 1 AS stock FROM stock_places s JOIN devices d ON d.id = s.device_id WHERE d.hazards = 1
         UNION ALL
         SELECT g.device_id, 'garden:' || g.place_id AS place_id, g.label, g.lat, g.lon, NULL AS fix_at, d.subscription, 0 AS stock FROM garden_places g JOIN devices d ON d.id = g.device_id WHERE d.hazards = 1`,
      )
      .all() as unknown as PlaceRow[]),
  ];
  const byDevice = new Map<string, PlaceRow[]>();
  for (const r of rows) byDevice.set(r.device_id, [...(byDevice.get(r.device_id) ?? []), r]);
  const previous = db.prepare('SELECT level FROM hazard_notices WHERE device_id = ? AND place_id = ? AND event_key = ?');
  const mark = db.prepare('INSERT OR REPLACE INTO hazard_notices (device_id, place_id, event_key, level, notified_at) VALUES (?, ?, ?, ?, ?)');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');

  for (const [deviceId, places] of byDevice) {
    for (const v of active) {
      const key = `oavv:${v.name}`;
      const hit = places
        .map((row) => ({ row, km: distanceKm(row, v) }))
        .filter(({ row, km }) => {
          if (km > volcanoRadiusKm(v.level)) return false;
          const before = previous.get(deviceId, row.place_id, key) as { level: number } | undefined;
          return !before || before.level < volcanoRank(v.level);
        })
        .sort((a, b) => a.km - b.km);
      if (!hit.length) continue;
      const { row, km } = hit[0]!;
      const stock = [...new Set(hit.filter((h) => h.row.stock).map((h) => h.row.label ?? ''))].filter(Boolean);
      const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, {
        type: 'volcano',
        volcano: {
          placeId: row.place_id,
          label: row.label,
          fixAt: row.fix_at,
          name: v.name,
          level: v.level as 'yellow' | 'orange' | 'red',
          distanceKm: Math.round(km),
          bearing: Math.round(bearingDeg(row, v)) % 360,
          ...(stock.length ? { stock } : {}),
          url: v.report,
          source: v.source,
        },
      });
      if (!delivered) {
        removeDevice.run(deviceId);
        result.removed++;
        break;
      }
      for (const h of hit) mark.run(deviceId, h.row.place_id, key, volcanoRank(v.level), now.getTime());
      result.sent++;
    }
  }
  return result;
}

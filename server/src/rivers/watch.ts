import { readFileSync } from 'node:fs';
import type { Db } from '../db.ts';
import { bearingDeg, distanceKm, withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';

/**
 * Niveles de los ríos de Argentina (INA, Alerta Hidrológico): avisa cuando un río llega al nivel de alerta o de evacuación de su
 * estación, o baja a «aguas bajas», y hay un lugar del dispositivo (waypoint, reserva o cantero guardados) a menos de 5 km.
 * Una vez por estación y lugar; otra vez si pasa de alerta a evacuación, y de nuevo en la próxima crecida o bajante (cuando el río
 * vuelve a lo normal se borra lo avisado). El catálogo de estaciones y sus umbrales es app/public/data/rivers-AR.json.
 */

export interface RiverStation {
  id: number;
  name: string;
  river: string;
  lat: number;
  lon: number;
  alert: number | null;
  evac: number | null;
  low: number | null;
  /** Serie de altura del INA. */
  series: number;
}

export type RiverState = 'evac' | 'alert' | 'low' | 'normal';

/** Hasta dónde un lugar «está sobre el río»: más lejos, la crecida o la bajante no lo afecta de la misma forma. */
export const RIVER_RADIUS_KM = 5;
/** Una lectura más vieja que esto no se usa para avisar (la estación dejó de reportar). */
export const RIVER_MAX_AGE_MS = 12 * 3_600_000;
/** Cada cuánto se leen los niveles. */
export const RIVER_EVERY_MS = 30 * 60_000;

export function riverState(level: number, s: Pick<RiverStation, 'alert' | 'evac' | 'low'>): RiverState {
  if (s.evac !== null && level >= s.evac) return 'evac';
  if (s.alert !== null && level >= s.alert) return 'alert';
  if (s.low !== null && level <= s.low) return 'low';
  return 'normal';
}

export function loadRiverCatalog(file: string): RiverStation[] {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { stations?: RiverStation[] };
  if (!Array.isArray(data.stations)) throw new Error('catálogo de ríos con formato desconocido');
  return data.stations;
}

export interface RiverLevel {
  level: number;
  /** ISO de la medición. */
  at: string;
}

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

/** Los lugares de los dispositivos con avisos de peligro (los mismos que usan los volcanes). */
function watchedPlaces(db: Db, now: Date, hereMaxAgeMs: number): PlaceRow[] {
  return [
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
}

/** Las estaciones con algún lugar guardado cerca: son las únicas cuyo nivel hace falta pedir. */
export function stationsToWatch(db: Db, stations: RiverStation[], now = new Date(), hereMaxAgeMs = 24 * 3_600_000): RiverStation[] {
  const places = watchedPlaces(db, now, hereMaxAgeMs);
  return stations.filter((s) => places.some((p) => distanceKm(p, s) <= RIVER_RADIUS_KM));
}

const rank = (state: RiverState): number => (state === 'evac' ? 2 : state === 'alert' ? 1 : state === 'low' ? 1 : 0);

export async function runRiverWatch(
  db: Db,
  push: PushSender,
  stations: RiverStation[],
  levels: Map<number, RiverLevel>,
  now = new Date(),
  hereMaxAgeMs = 24 * 3_600_000,
): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  // Solo lecturas recientes: una estación que dejó de reportar ni avisa ni da por terminada la crecida.
  const fresh = stations.flatMap((s) => {
    const l = levels.get(s.series);
    if (!l || now.getTime() - Date.parse(l.at) > RIVER_MAX_AGE_MS) return [];
    return [{ s, level: l, state: riverState(l.level, s) }];
  });
  if (!fresh.length) return result;

  // Cuando el río vuelve a lo normal (o deja de estar bajo), se borra lo avisado: la próxima crecida o bajante avisa de nuevo.
  const forget = db.prepare('DELETE FROM hazard_notices WHERE event_key = ?');
  for (const { s, state } of fresh) {
    if (state === 'normal') {
      forget.run(`river:${s.id}`);
      forget.run(`river-low:${s.id}`);
    } else if (state === 'low') forget.run(`river:${s.id}`);
    else forget.run(`river-low:${s.id}`);
  }

  const rows = watchedPlaces(db, now, hereMaxAgeMs);
  const byDevice = new Map<string, PlaceRow[]>();
  for (const r of rows) byDevice.set(r.device_id, [...(byDevice.get(r.device_id) ?? []), r]);
  const previous = db.prepare('SELECT level FROM hazard_notices WHERE device_id = ? AND place_id = ? AND event_key = ?');
  const mark = db.prepare('INSERT OR REPLACE INTO hazard_notices (device_id, place_id, event_key, level, notified_at) VALUES (?, ?, ?, ?, ?)');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');

  for (const [deviceId, places] of byDevice) {
    for (const { s, level, state } of fresh) {
      if (state === 'normal') continue;
      const key = state === 'low' ? `river-low:${s.id}` : `river:${s.id}`;
      const hit = places
        .map((row) => ({ row, km: distanceKm(row, s) }))
        .filter(({ row, km }) => {
          if (km > RIVER_RADIUS_KM) return false;
          const before = previous.get(deviceId, row.place_id, key) as { level: number } | undefined;
          return !before || before.level < rank(state);
        })
        .sort((a, b) => a.km - b.km);
      if (!hit.length) continue;
      const { row, km } = hit[0]!;
      const stock = [...new Set(hit.filter((h) => h.row.stock).map((h) => h.row.label ?? ''))].filter(Boolean);
      const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, {
        type: 'river',
        river: {
          placeId: row.place_id,
          label: row.label,
          fixAt: row.fix_at,
          station: s.name,
          river: s.river,
          state,
          level: level.level,
          threshold: (state === 'evac' ? s.evac : state === 'alert' ? s.alert : s.low) ?? level.level,
          at: level.at,
          distanceKm: Math.round(km * 10) / 10,
          bearing: Math.round(bearingDeg(row, s)) % 360,
          ...(stock.length ? { stock } : {}),
        },
      });
      if (!delivered) {
        removeDevice.run(deviceId);
        result.removed++;
        break;
      }
      for (const h of hit) mark.run(deviceId, h.row.place_id, key, rank(state), now.getTime());
      result.sent++;
    }
  }
  return result;
}

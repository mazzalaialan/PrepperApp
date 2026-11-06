import type { Db } from '../db.ts';
import { withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import type { RainSource } from './source.ts';
import { nextEpisode } from './episode.ts';

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  fix_at: string | null;
  notified: number;
  rain_level: number;
  dry_since: number | null;
  subscription: string;
}

export interface RainWatchResult {
  checked: number;
  sent: number;
  removed: number;
}

/**
 * Una pasada de los avisos de lluvia con la app cerrada: consulta cada lugar
 * (los repetidos, una sola vez) y avisa una vez por episodio, igual que la app
 * abierta (app/src/modules/weather/rainWatch.ts): el episodio termina recién
 * después de 3 horas sin lluvia, y dentro de él solo se vuelve a avisar si la
 * lluvia sube de nivel (rain/episode.ts). "Donde estoy" usa la última
 * ubicación que mandó la app; si es más vieja que `hereMaxAgeMs`, no se usa, y
 * si está cerca de un waypoint con aviso, avisa solo el waypoint.
 */
export async function runRainWatch(db: Db, push: PushSender, source: RainSource, now = new Date(), hereMaxAgeMs = 24 * 3_600_000): Promise<RainWatchResult> {
  const result: RainWatchResult = { checked: 0, sent: 0, removed: 0 };
  const rows = withoutDuplicateHere(
    db
      .prepare(
        `SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, p.notified, p.rain_level, p.dry_since, d.subscription
         FROM rain_places p JOIN devices d ON d.id = p.device_id`,
      )
      .all() as unknown as PlaceRow[],
  ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= hereMaxAgeMs);
  if (rows.length === 0) return result;

  const keyOf = (r: PlaceRow) => `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
  const unique = [...new Map(rows.map((r) => [keyOf(r), { lat: r.lat, lon: r.lon }])).entries()];
  const outlooks = await source.outlooks(unique.map(([, p]) => p));
  const byKey = new Map(unique.map(([key], i) => [key, outlooks[i] ?? null]));
  result.checked = unique.length;

  const save = db.prepare('UPDATE rain_places SET notified = ?, rain_level = ?, dry_since = ? WHERE device_id = ? AND place_id = ?');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  const gone = new Set<string>();

  for (const row of rows) {
    if (gone.has(row.device_id)) continue;
    const outlook = byKey.get(keyOf(row));
    if (!outlook) continue;
    const prev = row.notified ? { level: row.rain_level || 1, drySince: row.dry_since } : null;
    const { episode, notify } = nextEpisode(prev, outlook, now.getTime());
    const store = () => save.run(episode ? 1 : 0, episode?.level ?? 0, episode?.drySince ?? null, row.device_id, row.place_id);
    if (!notify || outlook.state === 'dry') {
      if (prev?.level !== episode?.level || prev?.drySince !== episode?.drySince) store();
      continue;
    }
    const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, {
      type: 'rain',
      rain: {
        placeId: row.place_id,
        label: row.label,
        state: outlook.state,
        inMinutes: outlook.state === 'soon' ? outlook.inMinutes : 0,
        mm: Math.round(outlook.mm * 10) / 10,
        fixAt: row.fix_at,
        ...(outlook.state === 'raining' && outlook.observedMmH !== undefined ? { observedMmH: outlook.observedMmH } : {}),
        ...(notify === 'stronger' ? { stronger: true } : {}),
      },
    });
    if (!delivered) {
      removeDevice.run(row.device_id);
      gone.add(row.device_id);
      result.removed++;
      continue;
    }
    store();
    result.sent++;
  }
  return result;
}

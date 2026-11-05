import type { Db } from '../db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../push.ts';
import { localParts } from '../time.ts';

/**
 * Avisos de la huerta con la app cerrada (ARQUITECTURA §10.1): helada,
 * riego y tareas. La app manda un lugar por cada grupo de canteros a menos de
 * ~1 km (todos los de casa son un solo lugar y dan un solo aviso), con los
 * cultivos al aire libre y desde qué mínima se queman, y los datos del riego.
 */

export interface GardenDay {
  date: string;
  et0: number;
  rain: number;
  min: number;
}

/** Clima diario de un punto: 10 días pasados y 3 de pronóstico, en la hora del lugar. */
export type GardenWeatherSource = (lat: number, lon: number) => Promise<GardenDay[] | null>;

export function openMeteoGarden(baseUrl: string, fetchImpl: typeof fetch = fetch): GardenWeatherSource {
  const base = baseUrl.replace(/\/+$/, '');
  return async (lat, lon) => {
    const params = new URLSearchParams({
      latitude: lat.toFixed(2),
      longitude: lon.toFixed(2),
      daily: 'et0_fao_evapotranspiration,precipitation_sum,temperature_2m_min',
      timezone: 'auto',
      past_days: '10',
      forecast_days: '3',
    });
    try {
      const res = await fetchImpl(`${base}/v1/forecast?${params}`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      const d = ((await res.json()) as { daily?: Record<string, unknown[]> }).daily;
      if (!d?.time) return null;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const out: GardenDay[] = [];
      d.time.forEach((date, i) => {
        const et0 = num(d.et0_fao_evapotranspiration?.[i]);
        const rain = num(d.precipitation_sum?.[i]);
        const min = num(d.temperature_2m_min?.[i]);
        if (typeof date === 'string' && et0 !== null && rain !== null && min !== null) out.push({ date, et0, rain, min });
      });
      return out.length ? out : null;
    } catch {
      return null;
    }
  };
}

export interface FrostCrop {
  name: string;
  /** Mínima desde la que se quema, °C. */
  threshold: number;
}

export interface WaterInput {
  kc: number;
  thresholdMm: number;
  /** Último riego marcado (día local) o null. */
  wateredOn: string | null;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const RAIN_LOSS_MM = 2;

/**
 * Déficit de agua del suelo desde el último riego (o desde hace 10 días).
 * ⚠ Misma cuenta que waterBalance en app/src/modules/garden/logic.ts: mantener ambas en sincronía.
 */
export function waterDeficit(days: GardenDay[], today: string, water: WaterInput): number {
  const tenDaysAgo = addDays(today, -10);
  const since = water.wateredOn && water.wateredOn > tenDaysAgo ? water.wateredOn : tenDaysAgo;
  let deficit = 0;
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.date <= since || d.date > today) continue;
    deficit = Math.max(0, deficit + d.et0 * water.kc - Math.max(0, d.rain - RAIN_LOSS_MM));
    deficit = Math.min(deficit, water.thresholdMm * 3);
  }
  return Math.round(deficit * 10) / 10;
}

/** El aviso de helada sale a la tarde, el día antes de la madrugada fría. */
export const FROST_FROM_HOUR = 17;

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  frost: string;
  water: string | null;
  frost_notified_date: string | null;
  water_notified: number;
  water_checked_day: string | null;
  subscription: string;
  timezone: string;
  notify_hour: number;
}

interface TaskRow {
  device_id: string;
  task_id: string;
  text: string;
  date: string;
}

export interface GardenWatchResult {
  sent: number;
  removed: number;
}

export async function runGardenWatch(db: Db, push: PushSender, source: GardenWeatherSource, now = new Date()): Promise<GardenWatchResult> {
  const result: GardenWatchResult = { sent: 0, removed: 0 };
  const gone = new Set<string>();
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  async function send(row: { device_id: string; subscription: string }, payload: PushPayload): Promise<boolean> {
    if (gone.has(row.device_id)) return false;
    const ok = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, payload);
    if (!ok) {
      removeDevice.run(row.device_id);
      gone.add(row.device_id);
      result.removed++;
      return false;
    }
    result.sent++;
    return true;
  }

  const places = db
    .prepare(
      `SELECT g.*, d.subscription, d.timezone, d.notify_hour FROM garden_places g JOIN devices d ON d.id = g.device_id`,
    )
    .all() as unknown as PlaceRow[];
  // Un pedido por celda de ~1 km aunque varios dispositivos tengan la huerta ahí.
  const weather = new Map<string, Promise<GardenDay[] | null>>();
  const weatherOf = (lat: number, lon: number) => {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (!weather.has(key)) weather.set(key, source(lat, lon));
    return weather.get(key)!;
  };
  const markFrost = db.prepare('UPDATE garden_places SET frost_notified_date = ? WHERE device_id = ? AND place_id = ?');
  const markWater = db.prepare('UPDATE garden_places SET water_notified = ?, water_checked_day = ? WHERE device_id = ? AND place_id = ?');

  for (const row of places) {
    const { day, hour } = localParts(now, row.timezone);
    const frostCrops = JSON.parse(row.frost) as FrostCrop[];
    const water = row.water ? (JSON.parse(row.water) as WaterInput) : null;
    const wantFrost = frostCrops.length > 0 && hour >= FROST_FROM_HOUR;
    const wantWater = water !== null && hour >= row.notify_hour && row.water_checked_day !== day;
    if (!wantFrost && !wantWater) continue;
    const days = await weatherOf(row.lat, row.lon);
    if (!days) continue;

    if (wantFrost) {
      // La mínima de mañana es la de esta madrugada que viene.
      const tomorrow = addDays(day, 1);
      const d = days.find((x) => x.date === tomorrow);
      const hit = d ? frostCrops.filter((c) => d.min <= c.threshold).map((c) => c.name) : [];
      if (d && hit.length && row.frost_notified_date !== tomorrow) {
        if (await send(row, { type: 'garden', garden: { kind: 'frost', placeId: row.place_id, label: row.label, date: tomorrow, min: Math.round(d.min), crops: [...new Set(hit)] } })) {
          markFrost.run(tomorrow, row.device_id, row.place_id);
        }
      }
    }

    if (wantWater) {
      const deficit = waterDeficit(days, day, water!);
      const needs = deficit >= water!.thresholdMm;
      // Un aviso por episodio: si llovió o se regó, se vuelve a avisar la próxima vez que falte agua.
      if (needs && !row.water_notified) {
        const rain = days.filter((x) => x.date > addDays(day, -10) && x.date <= day).reduce((s, x) => s + x.rain, 0);
        if (await send(row, { type: 'garden', garden: { kind: 'water', placeId: row.place_id, label: row.label, mm: Math.round(deficit), rain: Math.round(rain) } })) {
          markWater.run(1, day, row.device_id, row.place_id);
        }
      } else {
        markWater.run(needs ? 1 : 0, day, row.device_id, row.place_id);
      }
    }
  }

  // Tareas: a la hora de aviso, todas las que ya corresponden juntas en un solo aviso.
  const devices = db.prepare('SELECT DISTINCT d.id AS device_id, d.subscription, d.timezone, d.notify_hour FROM devices d JOIN garden_tasks t ON t.device_id = d.id WHERE t.notified = 0').all() as unknown as {
    device_id: string;
    subscription: string;
    timezone: string;
    notify_hour: number;
  }[];
  const tasksOf = db.prepare('SELECT device_id, task_id, text, date FROM garden_tasks WHERE device_id = ? AND notified = 0 AND date <= ? ORDER BY date');
  const markTask = db.prepare('UPDATE garden_tasks SET notified = 1 WHERE device_id = ? AND task_id = ?');
  for (const d of devices) {
    if (gone.has(d.device_id)) continue;
    const { day, hour } = localParts(now, d.timezone);
    if (hour < d.notify_hour) continue;
    const due = tasksOf.all(d.device_id, day) as unknown as TaskRow[];
    if (!due.length) continue;
    if (await send(d, { type: 'garden', garden: { kind: 'tasks', tasks: due.map((t) => t.text) } })) {
      for (const t of due) markTask.run(d.device_id, t.task_id);
    }
  }
  return result;
}

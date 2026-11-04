import { db } from '@/core/db/db';

/**
 * Línea de nieve para la capa de riesgo de avalancha: solo se pinta la
 * pendiente donde puede haber nieve acumulada. Se estima con la isoterma de
 * 0 °C (altura de congelamiento) de Open-Meteo para el lugar que se mira: la
 * más baja de los últimos 3 días y los próximos 2 (la nieve que cayó queda
 * aunque después suba), menos 300 m (en las nevadas la nieve llega por
 * debajo de la isoterma). Se guarda la última para usarla sin conexión, y se
 * puede poner a mano.
 */

export const SNOW_BELOW_FREEZING_M = 300;
/** Más lejos que esto (o más viejo), se vuelve a consultar. */
const REFRESH_KM = 50;
const REFRESH_MS = 3 * 3_600_000;
const KEY = 'snowline';

export interface Snowline {
  /** Altura desde la que se pinta (m). */
  meters: number;
  /** Isoterma de 0 °C más baja de la ventana (m). */
  freezingMin: number;
  lat: number;
  lon: number;
  /** Cuándo se consultó. */
  at: number;
}

/** De las alturas de congelamiento por hora a la línea de nieve (redondeada a 50 m). */
export function snowlineFrom(freezingLevels: (number | null)[]): { meters: number; freezingMin: number } | null {
  const valid = freezingLevels.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  const freezingMin = Math.min(...valid);
  return { meters: Math.max(0, Math.round((freezingMin - SNOW_BELOW_FREEZING_M) / 50) * 50), freezingMin: Math.round(freezingMin) };
}

export async function fetchSnowline(base: string, lat: number, lon: number): Promise<Snowline> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: 'freezing_level_height',
    past_days: '3',
    forecast_days: '2',
    timezone: 'GMT',
  });
  const res = await fetch(`${base.replace(/\/+$/, '')}/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error('snowline');
  const data = (await res.json()) as { hourly?: { freezing_level_height?: (number | null)[] } };
  const s = snowlineFrom(data.hourly?.freezing_level_height ?? []);
  if (!s) throw new Error('snowline');
  return { ...s, lat, lon, at: Date.now() };
}

export async function readSnowline(): Promise<Snowline | null> {
  return ((await db.meta.get(KEY))?.value as Snowline | undefined) ?? null;
}

export async function saveSnowline(s: Snowline): Promise<void> {
  await db.meta.put({ key: KEY, value: s });
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111.2, (a.lon - b.lon) * 111.2 * Math.cos((a.lat * Math.PI) / 180));

/** ¿Hay que volver a consultar para este lugar? */
export function needsRefresh(s: Snowline | null, at: { lat: number; lon: number }, now = Date.now()): boolean {
  return !s || now - s.at > REFRESH_MS || km(s, at) > REFRESH_KM;
}

// ---------- Sin conexión: el pronóstico guardado con cada zona descargada ----------

/** Isoterma de 0 °C hora por hora, guardada con la zona al descargarla (pasado y próximos días). */
export interface FreezingSeries {
  /** Hora (ms) del primer valor. */
  start: number;
  values: (number | null)[];
  /** Cuándo se bajó. */
  at: number;
}

const HOUR = 3_600_000;
const PAST_DAYS = 3;
const AHEAD_DAYS = 2;
/** Al bajar una zona: hasta dos semanas de pronóstico, para salidas largas sin señal. */
export const ZONE_FORECAST_DAYS = 14;

export async function fetchFreezingSeries(base: string, lat: number, lon: number): Promise<FreezingSeries> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: 'freezing_level_height',
    past_days: String(PAST_DAYS),
    forecast_days: String(ZONE_FORECAST_DAYS),
    timezone: 'GMT',
  });
  const res = await fetch(`${base.replace(/\/+$/, '')}/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error('snowline');
  const data = (await res.json()) as { hourly?: { time?: string[]; freezing_level_height?: (number | null)[] } };
  const time = data.hourly?.time?.[0];
  const values = data.hourly?.freezing_level_height ?? [];
  if (!time || values.length === 0) throw new Error('snowline');
  return { start: Date.parse(`${time}:00Z`), values: values.map((v) => (typeof v === 'number' ? Math.round(v) : null)), at: Date.now() };
}

/**
 * Línea de nieve para `now` con una serie guardada: la misma ventana que con
 * conexión (3 días atrás, 2 adelante), hasta donde llegue la serie. `null` si
 * `now` ya pasó el final de la serie.
 */
export function snowlineAt(series: FreezingSeries, now = Date.now()): { meters: number; freezingMin: number } | null {
  const end = series.start + series.values.length * HOUR;
  if (now >= end || now < series.start) return null;
  const from = Math.max(0, Math.floor((now - PAST_DAYS * 24 * HOUR - series.start) / HOUR));
  const to = Math.min(series.values.length, Math.ceil((now + AHEAD_DAYS * 24 * HOUR - series.start) / HOUR));
  return snowlineFrom(series.values.slice(from, to));
}

export interface ZoneWithSeries {
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  freezing?: FreezingSeries;
}

/** Margen alrededor de la zona: la isoterma cambia poco en unos kilómetros. */
const ZONE_MARGIN_KM = 50;

export type SnowlineChoice =
  | { source: 'live'; meters: number; freezingMin: number; at: number }
  | { source: 'zone'; meters: number; freezingMin: number; at: number; zone: string }
  | { source: 'none' };

/**
 * Qué línea de nieve usar para el lugar que se mira: la consultada con
 * conexión si es de cerca y reciente; si no, la del pronóstico guardado con
 * la zona descargada más cercana; si no hay ninguna, nada (se pinta toda la
 * pendiente). Nunca una de otro lugar.
 */
export function chooseSnowline(at: { lat: number; lon: number }, live: Snowline | null, zones: ZoneWithSeries[], now = Date.now()): SnowlineChoice {
  if (live && km(live, at) <= REFRESH_KM && now - live.at <= 2 * REFRESH_MS) return { source: 'live', meters: live.meters, freezingMin: live.freezingMin, at: live.at };
  const candidates = zones
    .filter((z) => z.freezing && km(z, at) <= z.radiusKm + ZONE_MARGIN_KM)
    .sort((a, b) => km(a, at) - km(b, at));
  for (const z of candidates) {
    const s = snowlineAt(z.freezing!, now);
    if (s) return { source: 'zone', ...s, at: z.freezing!.at, zone: z.name };
  }
  return { source: 'none' };
}

/**
 * Limpieza: saca de la serie las horas de más de 3 días atrás (ya no entran en
 * ninguna ventana). `null` si ya no queda nada útil (el pronóstico se venció).
 */
export function pruneSeries(series: FreezingSeries, now = Date.now()): FreezingSeries | null {
  const drop = Math.max(0, Math.floor((now - PAST_DAYS * 24 * HOUR - series.start) / HOUR));
  if (drop >= series.values.length) return null;
  if (drop === 0) return series;
  return { ...series, start: series.start + drop * HOUR, values: series.values.slice(drop) };
}

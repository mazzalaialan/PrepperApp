import { strFromU8, strToU8 } from 'fflate';
import { blobStore } from '@/core/db/repository';
import type { Size, View } from './projection';
import { viewBBox } from './projection';

/**
 * Fuentes de datos del Mapa de Meteorología (ARQUITECTURA §12.4). Todas son
 * abiertas, sin clave y aceptan pedidos desde el navegador (CORS):
 *
 * - Satélite GOES‑19 (infrarrojo): NASA GIBS, cada 10 min, con unos 40–50 min de demora.
 * - Radar: RainViewer, cada 10 min las últimas 2 h. En Argentina solo cubre
 *   el noreste (no publica los radares del SMN).
 * - Sismos: USGS, magnitud 2,5 o más de los últimos 7 días.
 * - Alertas de desastres: GDACS (ONU y Comisión Europea): ciclones tropicales,
 *   inundaciones, sequías, incendios forestales y erupciones, con nivel de alerta.
 * - Focos de calor: VIIRS (NASA GIBS), por día.
 * - Clima por zona: Open-Meteo (la fuente configurada en Ajustes), una sola
 *   consulta con las capitales de cada provincia, región y departamento.
 */

const FETCH_TIMEOUT_MS = 20_000;

export class MapSourceError extends Error {
  constructor(public readonly source: string) {
    super(source);
    this.name = 'MapSourceError';
  }
}

async function getJson<T>(url: string, source: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new MapSourceError(source);
  }
  if (!res.ok) throw new MapSourceError(source);
  return (await res.json()) as T;
}

// ---------- Satélite (NASA GIBS) ----------

export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
export const SATELLITE_LAYER = 'GOES-East_ABI_Band13_Clean_Infrared';
/** Focos de calor VIIRS (375 m), solo los puntos: el producto de fuego de GOES es una imagen opaca que tapa el mapa. */
export const FIRE_LAYER = 'VIIRS_NOAA20_Thermal_Anomalies_375m_All';

/** Los focos se publican por día (UTC): hoy y ayer cubren las últimas 24–48 h. */
export function fireDays(now = new Date()): string[] {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return [day(new Date(now.getTime() - 86_400_000)), day(now)];
}
const STEP_MIN = 10;
/** 2 horas de imágenes, una cada 10 minutos. */
export const FRAME_COUNT = 13;
/** Si falta una imagen, GIBS responde un PNG vacío de pocos bytes. */
const EMPTY_PNG_MAX_BYTES = 200;

export function gibsUrl(layer: string, time: string, view: View, size: Size, ratio = 1): string {
  const b = viewBBox(view, size);
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: layer,
    CRS: 'EPSG:3857',
    BBOX: [b.minX, b.minY, b.maxX, b.maxY].map((n) => Math.round(n)).join(','),
    WIDTH: String(Math.round(size.width * ratio)),
    HEIGHT: String(Math.round(size.height * ratio)),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
    TIME: time,
  });
  return `${GIBS_WMS}?${params}`;
}

const floorTo10 = (d: Date) => {
  const t = new Date(d);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() - (t.getUTCMinutes() % STEP_MIN));
  return t;
};

export const isoMinute = (d: Date) => `${d.toISOString().slice(0, 16)}:00Z`;

/** Última imagen publicada: se prueba hacia atrás con pedidos diminutos (16×16 px). */
export async function latestGibsTime(layer: string, now = new Date()): Promise<Date> {
  const probeView: View = { cx: -7_100_000, cy: -4_900_000, scale: 16 / 2_600_000 };
  const probeSize: Size = { width: 16, height: 16 };
  let t = floorTo10(new Date(now.getTime() - 20 * 60_000));
  for (let i = 0; i < 12; i++, t = new Date(t.getTime() - STEP_MIN * 60_000)) {
    try {
      const res = await fetch(gibsUrl(layer, isoMinute(t), probeView, probeSize), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok && (await res.blob()).size > EMPTY_PNG_MAX_BYTES) return t;
    } catch {
      throw new MapSourceError('satellite');
    }
  }
  throw new MapSourceError('satellite');
}

/** Horarios de la animación, del más viejo al más nuevo. */
export function frameTimes(latest: Date, count = FRAME_COUNT): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(latest.getTime() - (count - 1 - i) * STEP_MIN * 60_000));
}

// ---------- Radar (RainViewer) ----------

export interface RadarFrames {
  host: string;
  frames: { time: Date; path: string }[];
}

/** RainViewer sirve el radar hasta el zoom 7 en su API gratuita. */
export const RADAR_MAX_ZOOM = 7;

export async function fetchRadarFrames(): Promise<RadarFrames> {
  const json = await getJson<{ host: string; radar: { past: { time: number; path: string }[] } }>(
    'https://api.rainviewer.com/public/weather-maps.json',
    'radar',
  );
  return { host: json.host, frames: json.radar.past.map((f) => ({ time: new Date(f.time * 1000), path: f.path })) };
}

/** Esquema de color 2 (universal), suavizado y nieve aparte. */
export const radarTileUrl = (host: string, path: string, z: number, x: number, y: number) => `${host}${path}/256/${z}/${x}/${y}/2/1_1.png`;

// ---------- Sismos (USGS) ----------

export interface Quake {
  id: string;
  lon: number;
  lat: number;
  mag: number;
  depthKm: number;
  place: string;
  time: number;
  url: string;
}

/** Un poco más que la región, para ver también lo que pasa cerca de la frontera y en el mar. */
const QUAKE_BOUNDS = { west: -82, east: -48, south: -60, north: -15 };

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number; url: string };
  geometry: { coordinates: [number, number, number] };
}

export function parseQuakes(json: { features: UsgsFeature[] }): Quake[] {
  return json.features
    .filter((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return f.properties.mag !== null && lon >= QUAKE_BOUNDS.west && lon <= QUAKE_BOUNDS.east && lat >= QUAKE_BOUNDS.south && lat <= QUAKE_BOUNDS.north;
    })
    .map((f) => ({
      id: f.id,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depthKm: f.geometry.coordinates[2],
      mag: f.properties.mag!,
      place: f.properties.place ?? '',
      time: f.properties.time,
      url: f.properties.url,
    }))
    .sort((a, b) => b.time - a.time);
}

export async function fetchQuakes(): Promise<Quake[]> {
  return parseQuakes(await getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', 'earthquakes'));
}

// ---------- Rayos (GOES-19 GLM, desde el servidor propio) ----------

export interface Flash {
  lat: number;
  lon: number;
  /** Segundos desde que cayó. */
  ageS: number;
}

export interface LightningBatch {
  updatedAt: string | null;
  flashes: Flash[];
}

/** Lo que tenga el servidor de la última pasada (cada minuto): reemplaza a lo anterior. */
export async function fetchLightning(serverUrl: string): Promise<LightningBatch> {
  const data = await getJson<{ updatedAt?: string | null; flashes?: unknown[] }>(`${serverUrl.replace(/\/+$/, '')}/api/lightning`, 'lightning');
  const flashes = (data.flashes ?? [])
    .filter((f): f is [number, number, number] => Array.isArray(f) && f.length >= 3 && f.every((n) => typeof n === 'number'))
    .map(([lat, lon, ageS]) => ({ lat, lon, ageS }));
  return { updatedAt: data.updatedAt ?? null, flashes };
}

// ---------- Alertas de desastres (GDACS) ----------

/** Ciclones tropicales, inundaciones, sequías, incendios forestales y erupciones (los sismos ya vienen de USGS). */
export type HazardType = 'TC' | 'FL' | 'DR' | 'WF' | 'VO';
export type HazardLevel = 'Green' | 'Orange' | 'Red';

export interface Hazard {
  id: string;
  type: HazardType;
  level: HazardLevel;
  name: string;
  lon: number;
  lat: number;
  from: string;
  to: string;
  severity: string;
  url: string;
}

interface GdacsFeature {
  geometry: { type: string; coordinates: number[] };
  properties: {
    eventtype: string;
    eventid: number;
    episodeid: number;
    name: string;
    alertlevel: string;
    fromdate: string;
    todate: string;
    severitydata?: { severitytext?: string };
    url?: { report?: string };
  };
}

const HAZARD_TYPES = new Set<string>(['TC', 'FL', 'DR', 'WF', 'VO']);

export function parseHazards(json: { features: GdacsFeature[] }): Hazard[] {
  return json.features
    .filter((f) => {
      if (f.geometry.type !== 'Point' || !HAZARD_TYPES.has(f.properties.eventtype)) return false;
      const [lon, lat] = f.geometry.coordinates as [number, number];
      return lon >= QUAKE_BOUNDS.west && lon <= QUAKE_BOUNDS.east && lat >= QUAKE_BOUNDS.south && lat <= QUAKE_BOUNDS.north;
    })
    .map((f) => ({
      id: `${f.properties.eventtype}-${f.properties.eventid}`,
      type: f.properties.eventtype as HazardType,
      level: (['Green', 'Orange', 'Red'].includes(f.properties.alertlevel) ? f.properties.alertlevel : 'Green') as HazardLevel,
      name: f.properties.name,
      lon: f.geometry.coordinates[0]!,
      lat: f.geometry.coordinates[1]!,
      from: f.properties.fromdate,
      to: f.properties.todate,
      severity: f.properties.severitydata?.severitytext ?? '',
      url: f.properties.url?.report ?? 'https://www.gdacs.org',
    }));
}

export async function fetchHazards(): Promise<Hazard[]> {
  return parseHazards(
    await getJson('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;DR;WF;VO&alertlevel=green;orange;red', 'hazards'),
  );
}

// ---------- Clima por zona (Open-Meteo) ----------

export interface ZonePoint {
  name: string;
  lon: number;
  lat: number;
}

export interface ZoneWeather extends ZonePoint {
  temp: number;
  precip: number;
  code: number;
  windSpeed: number;
  windDir: number;
  gusts: number;
}

interface OpenMeteoCurrent {
  current?: {
    temperature_2m: number | null;
    precipitation: number | null;
    weather_code: number | null;
    wind_speed_10m: number | null;
    wind_direction_10m: number | null;
    wind_gusts_10m: number | null;
  };
}

export function zoneWeatherUrl(base: string, points: ZonePoint[]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(3)).join(','),
    longitude: points.map((p) => p.lon.toFixed(3)).join(','),
    current: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    timezone: 'auto',
  });
  return `${base.replace(/\/+$/, '')}/v1/forecast?${params}`;
}

export function parseZoneWeather(json: OpenMeteoCurrent | OpenMeteoCurrent[], points: ZonePoint[]): ZoneWeather[] {
  // Con un solo punto Open-Meteo devuelve un objeto; con varios, una lista en el mismo orden.
  const list = Array.isArray(json) ? json : [json];
  const out: ZoneWeather[] = [];
  list.forEach((item, i) => {
    const c = item.current;
    const p = points[i];
    if (!p || !c || c.temperature_2m === null) return;
    out.push({
      ...p,
      temp: c.temperature_2m,
      precip: c.precipitation ?? 0,
      code: c.weather_code ?? 0,
      windSpeed: c.wind_speed_10m ?? 0,
      windDir: c.wind_direction_10m ?? 0,
      gusts: c.wind_gusts_10m ?? 0,
    });
  });
  return out;
}

export async function fetchZoneWeather(base: string, points: ZonePoint[]): Promise<ZoneWeather[]> {
  return parseZoneWeather(await getJson(zoneWeatherUrl(base, points), 'zoneWeather'), points);
}

// ---------- Lo último descargado, para verlo sin conexión ----------

export interface MapCache {
  quakes?: { fetchedAt: string; items: Quake[] };
  hazards?: { fetchedAt: string; items: Hazard[] };
  zones?: { fetchedAt: string; items: ZoneWeather[] };
}

const CACHE_ID = 'weathermap-cache';

export async function readMapCache(): Promise<MapCache> {
  const bytes = await blobStore.get(CACHE_ID);
  if (!bytes) return {};
  try {
    return JSON.parse(strFromU8(bytes)) as MapCache;
  } catch {
    return {};
  }
}

export async function writeMapCache(changes: MapCache): Promise<void> {
  const next = { ...(await readMapCache()), ...changes };
  await blobStore.put(CACHE_ID, strToU8(JSON.stringify(next)) as Uint8Array<ArrayBuffer>);
}

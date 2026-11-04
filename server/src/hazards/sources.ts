/**
 * Peligros naturales para avisar con la app cerrada (los mismos que muestra
 * el mapa del clima): sismos de USGS y eventos de GDACS (ONU y Comisión
 * Europea). Son fuentes públicas y abiertas; los avisos son informativos.
 */

export type HazardKind = 'quake' | 'TC' | 'FL' | 'WF' | 'VO';
export type GdacsLevel = 'Green' | 'Orange' | 'Red';

export interface HazardEvent {
  /** Identificador estable del evento (para no avisar dos veces). */
  key: string;
  kind: HazardKind;
  lat: number;
  lon: number;
  /** Lugar (sismo) o nombre del evento. */
  name: string;
  /** Cuándo ocurrió (sismo) o última actualización (GDACS), ms. */
  at: number;
  magnitude?: number;
  /** USGS marca posible tsunami. */
  tsunami?: boolean;
  level?: GdacsLevel;
  url: string;
}

export const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
export const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;WF;VO&alertlevel=green;orange;red';

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number; tsunami?: number; type?: string; url?: string };
  geometry: { coordinates: [number, number, number?] };
}

export function parseUsgs(json: { features?: UsgsFeature[] }): HazardEvent[] {
  return (json.features ?? []).flatMap((f) => {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || typeof lon !== 'number' || typeof f.properties?.mag !== 'number') return [];
    if (f.properties.type && f.properties.type !== 'earthquake') return [];
    return [
      {
        key: `usgs:${f.id}`,
        kind: 'quake' as const,
        lat,
        lon,
        name: f.properties.place ?? '',
        at: f.properties.time,
        magnitude: Math.round(f.properties.mag * 10) / 10,
        tsunami: f.properties.tsunami === 1,
        url: f.properties.url ?? 'https://earthquake.usgs.gov',
      },
    ];
  });
}

interface GdacsFeature {
  properties: { eventtype: string; eventid: number; alertlevel: string; name?: string; datemodified?: string; todate?: string; iscurrent?: string; url?: { report?: string } };
  geometry: { type: string; coordinates: number[] };
}

const KINDS = new Set(['TC', 'FL', 'WF', 'VO']);
const LEVELS = new Set(['Green', 'Orange', 'Red']);

export function parseGdacs(json: { features?: GdacsFeature[] }): HazardEvent[] {
  return (json.features ?? []).flatMap((f) => {
    const p = f.properties;
    if (!p || !KINDS.has(p.eventtype) || !LEVELS.has(p.alertlevel) || p.iscurrent === 'false') return [];
    if (f.geometry?.type !== 'Point') return [];
    const [lon, lat] = f.geometry.coordinates;
    if (typeof lat !== 'number' || typeof lon !== 'number') return [];
    const at = Date.parse(`${p.datemodified ?? p.todate ?? ''}Z`);
    return [
      {
        key: `gdacs:${p.eventtype}:${p.eventid}`,
        kind: p.eventtype as HazardKind,
        lat,
        lon,
        name: p.name ?? '',
        at: Number.isFinite(at) ? at : Date.now(),
        level: p.alertlevel as GdacsLevel,
        url: p.url?.report ?? 'https://www.gdacs.org',
      },
    ];
  });
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'VikArg (servidor propio)' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export const fetchQuakes = async (fetchImpl: typeof fetch = fetch) => parseUsgs((await getJson(USGS_URL, fetchImpl)) as { features?: UsgsFeature[] });
/** GDACS devuelve de a 100 (los vigentes primero): se siguen pidiendo páginas mientras haya vigentes (~135 KB cada una). */
export async function fetchGdacs(fetchImpl: typeof fetch = fetch, maxPages = 4): Promise<HazardEvent[]> {
  const out: HazardEvent[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = (await getJson(`${GDACS_URL}&pagenumber=${page}`, fetchImpl)) as { features?: GdacsFeature[] };
    const batch = json.features ?? [];
    out.push(...parseGdacs(json));
    if (batch.length < 100 || !batch.some((f) => f.properties?.iscurrent === 'true')) break;
  }
  return out;
}

// ---------- A quién le importa ----------

/** Hasta dónde se avisa un sismo según su magnitud (lo que se puede llegar a sentir o afectar). */
export function quakeRadiusKm(magnitude: number): number {
  if (magnitude >= 7) return 1500;
  if (magnitude >= 6) return 600;
  if (magnitude >= 5) return 300;
  if (magnitude >= 4) return 100;
  if (magnitude >= 3.5) return 40;
  return 0;
}

/** Eventos de GDACS: los graves desde más lejos. */
export function gdacsRadiusKm(level: GdacsLevel): number {
  return level === 'Red' ? 800 : level === 'Orange' ? 500 : 100;
}

export const radiusFor = (e: HazardEvent) => (e.kind === 'quake' ? quakeRadiusKm(e.magnitude ?? 0) : gdacsRadiusKm(e.level ?? 'Green'));

/** Nivel para comparar (un evento que empeora se vuelve a avisar). */
export const severity = (e: HazardEvent) => (e.kind === 'quake' ? 0 : e.level === 'Red' ? 3 : e.level === 'Orange' ? 2 : 1);

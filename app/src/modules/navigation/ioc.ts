import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from '@/modules/emergency/dataFile';
import type { TideStation } from './tides';
import { tideLevelAt } from './tides';

/**
 * Mareógrafos medidos del IOC (Sea Level Station Monitoring Facility, VLIZ): el servidor guarda la clave y la app pide
 * `GET /api/ioc/:code` (ver server/src/ioc/levels.ts). Los niveles vienen sin control de calidad y con el cero propio de cada sensor,
 * así que no se muestran como alturas: se compara su forma con la marea calculada y se mira cuánto se separan.
 */
export interface IocStation {
  code: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  operator: string;
}

export interface IocCatalog {
  generated: string;
  source: string;
  stations: IocStation[];
}

export interface IocLevels {
  code: string;
  sensor: string;
  fetchedAt: number;
  stale?: boolean;
  /** [instante en ms, nivel en m sobre el cero propio del sensor]. */
  points: [number, number][];
}

export const IOC_NEAR_KM = 30;

export function loadIocCatalog(): Promise<IocCatalog> {
  return loadDataFile<IocCatalog>('ioc-stations.json');
}

/** El mareógrafo medido más cercano a una estación de mareas, si está a menos de `maxKm`. */
export function iocNear(stations: IocStation[], lat: number, lon: number, maxKm = IOC_NEAR_KM): { station: IocStation; km: number } | null {
  let best: { station: IocStation; km: number } | null = null;
  for (const s of stations) {
    const km = distanceMeters({ lat, lon }, { lat: s.lat, lon: s.lon }) / 1000;
    if (km <= maxKm && (!best || km < best.km)) best = { station: s, km };
  }
  return best;
}

export interface MeasuredSeries {
  /** Medición llevada al nivel de la marea calculada (se le resta el desfase promedio). */
  points: { time: Date; level: number }[];
  /** Medido menos calculado en el último punto (m): positivo, el agua está más alta que lo previsto. */
  deviation: number;
  /** Cuándo fue ese último punto. */
  lastAt: Date;
  /** Qué tan bien sigue la medición a la marea calculada: raíz del error entre ambas (m); alto, algo anda mal con el sensor o el cálculo. */
  rms: number;
}

/** Resta de la medición el desfase promedio respecto a lo calculado y devuelve cuánto se separan al final. Null si hay muy pocos puntos. */
export function measuredSeries(levels: IocLevels, station: TideStation): MeasuredSeries | null {
  if (levels.points.length < 12) return null;
  const diffs = levels.points.map(([ms, v]) => v - tideLevelAt(station, new Date(ms)));
  const offset = diffs.reduce((a, c) => a + c, 0) / diffs.length;
  const points = levels.points.map(([ms, v]) => ({ time: new Date(ms), level: v - offset }));
  const resid = diffs.map((d) => d - offset);
  const last = levels.points[levels.points.length - 1]!;
  // La desviación final se promedia sobre la última hora (6 puntos) para no depender de un punto suelto.
  const tail = resid.slice(-6);
  return {
    points,
    deviation: tail.reduce((a, c) => a + c, 0) / tail.length,
    lastAt: new Date(last[0]),
    rms: Math.sqrt(resid.reduce((a, c) => a + c * c, 0) / resid.length),
  };
}

export async function fetchIocLevels(server: string, code: string): Promise<IocLevels> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/ioc/${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  return (await res.json()) as IocLevels;
}

const STORE = 'vikarg.ioc.last.';
export function loadSavedIoc(code: string): IocLevels | null {
  try {
    const raw = localStorage.getItem(STORE + code);
    return raw ? (JSON.parse(raw) as IocLevels) : null;
  } catch {
    return null;
  }
}
export function saveIoc(l: IocLevels): void {
  try {
    localStorage.setItem(STORE + l.code, JSON.stringify(l));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

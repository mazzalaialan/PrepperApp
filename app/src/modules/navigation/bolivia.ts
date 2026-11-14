import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from '@/modules/emergency/dataFile';

/**
 * Niveles de los ríos y del lago Titicaca de Bolivia (SENAMHI Bolivia): el reporte diario es un PDF que lee el servidor
 * (`GET /api/rivers/bo`, server/src/rivers/bo.ts); las estaciones con sus coordenadas vienen con la app (`data/rivers-BO.json`).
 * Las lecturas son en centímetros sobre la escala de cada estación; algunas estaciones traen lecturas viejas: se muestra la fecha de cada una.
 */
export interface BoStation {
  name: string;
  lat: number;
  lon: number;
  /** Ubicación aproximada (el pueblo o el puente, no la escala). */
  approx: boolean;
}

export interface BoCatalog {
  generatedAt: string;
  source: string;
  stations: BoStation[];
}

export interface BoReading {
  station: string;
  river: string;
  prevDate: string;
  prevCm: number;
  lastDate: string;
  lastCm: number;
  zeroCm: number | null;
  trend: 'rising' | 'falling' | 'steady';
}

export interface BoLevels {
  reportDate: string;
  fetchedAt: number;
  url: string;
  readings: BoReading[];
  /** El servidor no pudo leer un reporte nuevo y devolvió el último bueno. */
  stale?: boolean;
}

export const loadBoCatalog = (): Promise<BoCatalog> => loadDataFile<BoCatalog>('rivers-BO.json');

export interface NearBo {
  reading: BoReading;
  station: BoStation;
  km: number;
}

/** Las lecturas de las estaciones más cercanas a un punto, hasta una distancia máxima. */
export function nearestBo(levels: BoLevels, catalog: BoCatalog, lat: number, lon: number, count = 6, maxKm = 300): NearBo[] {
  const byName = new Map(catalog.stations.map((s) => [s.name, s]));
  return levels.readings
    .flatMap((reading) => {
      const station = byName.get(reading.station);
      return station ? [{ reading, station, km: distanceMeters({ lat, lon }, station) / 1000 }] : [];
    })
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

/** Días entre la fecha de una lectura (AAAA-MM-DD) y el día del reporte. */
export function ageDays(readingDate: string, reportDate: string): number {
  return Math.round((Date.parse(reportDate) - Date.parse(readingDate)) / 86_400_000);
}

/** Una lectura más vieja que esto no es «de hoy»: se avisa. */
export const OLD_READING_DAYS = 5;

export async function fetchBoLevels(server: string): Promise<BoLevels> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/rivers/bo`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  return (await res.json()) as BoLevels;
}

const STORE = 'vikarg.rivers.bo.last';
export function loadSavedBo(): BoLevels | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as BoLevels) : null;
  } catch {
    return null;
  }
}
export function saveBo(l: BoLevels): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}

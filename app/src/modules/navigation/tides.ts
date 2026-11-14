import { createTidePredictor } from '@neaps/tide-predictor';
import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from '@/modules/emergency/dataFile';

/**
 * Mareas sin conexión: la altura se calcula en el teléfono con constantes armónicas (tools/tide-data → `data/tides.json`,
 * TICON-4, CC BY 4.0) y el cálculo de @neaps/tide-predictor (MIT). Es la marea astronómica: no incluye viento, presión ni crecidas
 * (en el Río de la Plata y en el Delta pesan mucho). Uruguay y Bolivia no tienen estación.
 */
export interface TideStation {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  source: string;
  license: string;
  issues: string[];
  /** Niveles de referencia en metros sobre el cero del mareógrafo. */
  datums: { MSL?: number; LAT?: number; HAT?: number };
  /** [nombre, amplitud (m), fase (° UTC)] */
  constituents: [string, number, number][];
}

export interface TidesData {
  generatedAt: string;
  source: string;
  stations: TideStation[];
}

export function loadTides(): Promise<TidesData> {
  return loadDataFile<TidesData>('tides.json');
}

/** Hasta dónde se considera cercana una estación: más lejos, la marea del lugar puede ser muy distinta. */
export const NEAR_KM = 100;

export interface NearStation {
  station: TideStation;
  km: number;
}

/** Las estaciones más cercanas a un punto, de menor a mayor distancia. */
export function nearestStations(stations: TideStation[], lat: number, lon: number, count = 3): NearStation[] {
  return stations
    .map((station) => ({ station, km: distanceMeters({ lat, lon }, station) / 1000 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

const predictor = (s: TideStation) => createTidePredictor(s.constituents.map(([name, amplitude, phase]) => ({ name, amplitude, phase })));

export interface TideExtreme {
  time: Date;
  /** Metros sobre (+) o bajo (−) el nivel medio del mar de la estación. */
  level: number;
  high: boolean;
}

/** Pleamares y bajamares entre dos instantes. */
export function tideExtremes(s: TideStation, start: Date, end: Date): TideExtreme[] {
  return predictor(s)
    .getExtremesPrediction({ start, end })
    .map((e) => ({ time: e.time, level: e.level, high: e.high }));
}

/** Altura cada `minutes` minutos entre dos instantes (para el gráfico). */
export function tideCurve(s: TideStation, start: Date, end: Date, minutes = 20): { time: Date; level: number }[] {
  return predictor(s)
    .getTimelinePrediction({ start, end, timeFidelity: minutes * 60 })
    .map((p) => ({ time: p.time, level: p.level }));
}

/** La altura en un instante. */
export function tideLevelAt(s: TideStation, time: Date): number {
  return predictor(s).getWaterLevelAtTime({ time }).level;
}

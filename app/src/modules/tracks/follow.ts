import type { Track } from '@/core/model/types';

/**
 * Seguir un track en vivo: dónde estoy respecto del recorrido (encima o
 * desviado), cuánto recorrí, cuánto falta, qué desnivel queda y cuál es el
 * próximo punto con nombre. Funciones puras: la pantalla solo les pasa el GPS.
 */

/** Recorrido listo para seguir: todos los segmentos en uno, con lo acumulado en cada vértice. */
export interface FollowLine {
  lat: number[];
  lon: number[];
  ele: (number | null)[];
  /** Distancia desde el inicio hasta cada vértice. */
  along: number[];
  /** Subida y bajada acumuladas desde el inicio hasta cada vértice. */
  up: number[];
  down: number[];
  totalM: number;
  /** Puntos con nombre del track, con la distancia del recorrido a la que quedan. */
  waypoints: { name: string; lat: number; lon: number; alongM: number }[];
}

export interface FollowState {
  /** Distancia al punto más cercano del recorrido. */
  offTrackM: number;
  /** Ese punto (para volver al track). */
  nearest: { lat: number; lon: number };
  alongM: number;
  remainingM: number;
  /** Desnivel que queda hasta el final. */
  upLeftM: number;
  downLeftM: number;
  /** Próximo punto con nombre hacia adelante. */
  next: { name: string; lat: number; lon: number; aheadM: number } | null;
  /** Llegó al final (a menos de ARRIVAL_M). */
  arrived: boolean;
}

/** Más lejos que esto del recorrido (o que la precisión del GPS, si es peor) es estar fuera del track. */
export const OFF_TRACK_M = 40;
export const ARRIVAL_M = 30;

const M_PER_DEG = 111_320;

export function prepareFollow(track: Pick<Track, 'segments' | 'waypoints'>, reversed = false): FollowLine {
  const pts = track.segments.flat();
  if (reversed) pts.reverse();
  const line: FollowLine = { lat: [], lon: [], ele: [], along: [], up: [], down: [], totalM: 0, waypoints: [] };
  let along = 0;
  let up = 0;
  let down = 0;
  pts.forEach(([lat, lon, ele], i) => {
    if (i > 0) {
      const [plat, plon, pele] = pts[i - 1]!;
      const k = Math.cos((lat * Math.PI) / 180);
      along += Math.hypot((lat - plat) * M_PER_DEG, (lon - plon) * M_PER_DEG * k);
      if (ele !== null && pele !== null) {
        if (ele > pele) up += ele - pele;
        else down += pele - ele;
      }
    }
    line.lat.push(lat);
    line.lon.push(lon);
    line.ele.push(ele);
    line.along.push(along);
    line.up.push(up);
    line.down.push(down);
  });
  line.totalM = along;
  line.waypoints = track.waypoints
    .map((w) => ({ name: w.name, lat: w.lat, lon: w.lon, alongM: project(line, w.lat, w.lon).alongM }))
    .sort((a, b) => a.alongM - b.alongM);
  return line;
}

/** Proyección de un punto sobre el recorrido: el lugar más cercano, a qué distancia y cuánto del recorrido hay hasta ahí. */
function project(line: FollowLine, lat: number, lon: number): { distM: number; alongM: number; lat: number; lon: number; seg: number; t: number } {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = { distM: Infinity, alongM: 0, lat: line.lat[0] ?? lat, lon: line.lon[0] ?? lon, seg: 0, t: 0 };
  const n = line.lat.length;
  if (n === 1) {
    const d = Math.hypot((lat - line.lat[0]!) * M_PER_DEG, (lon - line.lon[0]!) * M_PER_DEG * k);
    return { ...best, distM: d };
  }
  for (let i = 0; i < n - 1; i++) {
    // En metros, con el primer vértice del tramo como origen.
    const ax = 0;
    const ay = 0;
    const bx = (line.lon[i + 1]! - line.lon[i]!) * M_PER_DEG * k;
    const by = (line.lat[i + 1]! - line.lat[i]!) * M_PER_DEG;
    const px = (lon - line.lon[i]!) * M_PER_DEG * k;
    const py = (lat - line.lat[i]!) * M_PER_DEG;
    const len2 = bx * bx + by * by;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2)) : 0;
    const d = Math.hypot(px - t * bx, py - t * by);
    if (d < best.distM) {
      best = {
        distM: d,
        alongM: line.along[i]! + t * (line.along[i + 1]! - line.along[i]!),
        lat: line.lat[i]! + t * (line.lat[i + 1]! - line.lat[i]!),
        lon: line.lon[i]! + t * (line.lon[i + 1]! - line.lon[i]!),
        seg: i,
        t,
      };
    }
  }
  return best;
}

export function followState(line: FollowLine, lat: number, lon: number): FollowState {
  const p = project(line, lat, lon);
  const i = p.seg;
  const lerp = (arr: number[]) => (arr.length > 1 ? arr[i]! + p.t * (arr[Math.min(i + 1, arr.length - 1)]! - arr[i]!) : (arr[0] ?? 0));
  const upHere = lerp(line.up);
  const downHere = lerp(line.down);
  const next = line.waypoints.find((w) => w.alongM > p.alongM + 10) ?? null;
  const last = line.lat.length - 1;
  const endM = Math.hypot((lat - line.lat[last]!) * M_PER_DEG, (lon - line.lon[last]!) * M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return {
    offTrackM: p.distM,
    nearest: { lat: p.lat, lon: p.lon },
    alongM: p.alongM,
    remainingM: Math.max(0, line.totalM - p.alongM),
    upLeftM: Math.max(0, Math.round(line.up[last]! - upHere)),
    downLeftM: Math.max(0, Math.round(line.down[last]! - downHere)),
    next: next ? { name: next.name, lat: next.lat, lon: next.lon, aheadM: next.alongM - p.alongM } : null,
    arrived: endM < ARRIVAL_M,
  };
}

/**
 * ¿Fuera del track? Con margen para no avisar a cada rato: sale pasando el
 * umbral (o la precisión del GPS, si es peor) y vuelve recién a 2/3 de él.
 */
export function isOffTrack(offTrackM: number, accuracyM: number, wasOff: boolean): boolean {
  const limit = Math.max(OFF_TRACK_M, accuracyM);
  return wasOff ? offTrackM > limit * (2 / 3) : offTrackM > limit;
}

/**
 * Tiempo estimado a pie, en minutos: 6 km/h en distancia y, en altura, 300 m
 * de subida y 600 m de bajada por hora. Se toma el mayor de los dos tiempos
 * más la mitad del menor.
 */
export function walkingMinutes(distanceM: number, upM: number, downM: number): number {
  const flat = distanceM / 6000;
  const climb = upM / 300 + downM / 600;
  return Math.round((Math.max(flat, climb) + Math.min(flat, climb) / 2) * 60);
}

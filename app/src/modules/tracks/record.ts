import { distanceMeters } from '@/core/geo/geo';
import type { Track } from '@/core/model/types';
import { simplify, trackStats, type TrackPoint } from './gpx';

/** Peor precisión aceptada: con más error el punto ensucia el recorrido. */
export const MAX_ACCURACY_M = 50;
/** Paso mínimo entre puntos: quieto, el GPS dibuja una maraña alrededor. */
const MIN_STEP_M = 8;

/** ¿Este punto suma al recorrido? Ni con mala precisión ni a menos de un paso del anterior. */
export function shouldAdd(last: TrackPoint | undefined, fix: { lat: number; lon: number; accuracy: number }): boolean {
  if (fix.accuracy > MAX_ACCURACY_M) return false;
  if (!last) return true;
  return distanceMeters({ lat: last[0], lon: last[1] }, fix) >= Math.max(MIN_STEP_M, fix.accuracy / 2);
}

/** Agrega el punto al último tramo (cada pausa abre uno nuevo). */
export function addPoint(segments: TrackPoint[][], p: TrackPoint): TrackPoint[][] {
  const out = segments.length ? segments.slice() : [[]];
  out[out.length - 1] = [...out[out.length - 1]!, p];
  return out;
}

/** Une el último tramo con el anterior (un corte que el usuario prefiere cerrar con una recta). */
export function joinLastSegments(segments: TrackPoint[][]): TrackPoint[][] {
  if (segments.length < 2) return segments;
  return [...segments.slice(0, -2), [...segments.at(-2)!, ...segments.at(-1)!]];
}

/** Lo grabado, ya terminado: tramos de al menos dos puntos, datos con todo y el recorrido simplificado. */
export function finishedTrack(track: Track, durationS: number): Track | null {
  const segments = track.segments.filter((s) => s.length > 1);
  if (segments.length === 0) return null;
  return { ...track, ...trackStats(segments), segments: segments.map((s) => simplify(s, 3)), recording: false, durationS };
}

/** Los primeros `n` puntos grabados: el camino de ida, sin lo que se grabó volviendo. */
export function firstPoints(track: Track, n: number): Track {
  if (!(n > 1)) return track;
  const segments: Track['segments'] = [];
  let left = n;
  for (const s of track.segments) {
    if (left <= 0) break;
    segments.push(s.slice(0, left));
    left -= s.length;
  }
  return { ...track, segments };
}

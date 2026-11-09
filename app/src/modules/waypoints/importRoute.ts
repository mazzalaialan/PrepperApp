import { newEntity } from '@/core/model/entity';
import type { Route, Track } from '@/core/model/types';
import { simplify, type TrackPoint } from '@/modules/tracks/gpx';

/** Tope de puntos de una ruta planificada: un recorrido grabado tiene miles; se simplifica (la forma se conserva). */
const MAX_ROUTE_POINTS = 400;

/** Une los tramos en una sola línea y la simplifica hasta que entre en el tope. */
export function lineFromSegments(segments: TrackPoint[][], max = MAX_ROUTE_POINTS): { lat: number; lon: number }[] {
  const all = segments.flat();
  let tol = 5;
  let pts = all;
  while (pts.length > max && tol < 5000) {
    pts = simplify(all, tol);
    tol *= 1.6;
  }
  return pts.map((p) => ({ lat: Math.round(p[0] * 1e6) / 1e6, lon: Math.round(p[1] * 1e6) / 1e6 }));
}

/** Una ruta planificada a partir de un track (importado o grabado): su línea, para ver las piernas, los rumbos y el desnivel. Null si no tiene recorrido. */
export function routeFromTrack(track: Track): Route | null {
  const line = lineFromSegments(track.segments);
  if (line.length < 2) return null;
  return newEntity<Route>({ name: track.name, waypointIds: [], notes: '', line });
}

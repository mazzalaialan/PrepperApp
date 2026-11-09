import { gunzipSync } from 'fflate';
import { newEntity } from '@/core/model/entity';
import type { Route } from '@/core/model/types';
import { GpxError, parseGpx, simplify, type TrackPoint } from '@/modules/tracks/gpx';
import { parseActivityFile } from '@/modules/training/interchange';
import { KmlError, kmlTextFromBytes, parseKml, type KmlPoint } from './kml';

/** Tope de puntos de una ruta importada: un recorrido grabado tiene miles; se simplifica (la forma se conserva). */
const MAX_ROUTE_POINTS = 400;

export class RouteFileError extends Error {
  constructor(public readonly code: 'unknown' | 'empty') {
    super(code);
    this.name = 'RouteFileError';
  }
}

export interface ImportedRoute {
  route: Route;
  /** Puntos con nombre del archivo (KML/GPX): se ofrecen como lugares, pero no se crean solos. */
  places: KmlPoint[];
}

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

/**
 * Arma una ruta planificada a partir de un archivo de ruta o recorrido: KML,
 * KMZ, GPX o TCX (también .gz). Los puntos con nombre no se convierten en
 * lugares: se devuelven aparte para que la persona decida.
 */
export function routeFromFile(bytes: Uint8Array, fileName: string): ImportedRoute {
  let data = bytes;
  let name = fileName;
  if (/\.gz$/i.test(name) || (data[0] === 0x1f && data[1] === 0x8b)) {
    data = gunzipSync(data);
    name = name.replace(/\.gz$/i, '');
  }
  const lower = name.toLowerCase();
  let title: string;
  let segments: TrackPoint[][];
  let places: KmlPoint[] = [];
  try {
    if (lower.endsWith('.kml') || lower.endsWith('.kmz')) {
      const kml = parseKml(kmlTextFromBytes(data), name);
      ({ name: title, segments, points: places } = kml);
    } else {
      const text = new TextDecoder().decode(data);
      if (/<TrainingCenterDatabase\b/i.test(text)) {
        const act = parseActivityFile(text, name);
        title = act.name;
        segments = act.segments;
      } else if (/<gpx\b/i.test(text)) {
        const gpx = parseGpx(text, name);
        title = gpx.name;
        segments = gpx.segments;
        places = gpx.waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon, ele: w.ele, desc: w.desc }));
      } else if (/<kml\b/i.test(text)) {
        const kml = parseKml(text, name);
        ({ name: title, segments, points: places } = kml);
      } else {
        throw new RouteFileError('unknown');
      }
    }
  } catch (err) {
    if (err instanceof KmlError || err instanceof GpxError) throw new RouteFileError(err.code === 'empty' ? 'empty' : 'unknown');
    throw err;
  }
  const line = lineFromSegments(segments);
  if (line.length < 2) throw new RouteFileError('empty');
  return { route: newEntity<Route>({ name: title.replace(/^Wikiloc\s*-\s*/i, '') || 'Ruta', waypointIds: [], notes: '', line }), places };
}

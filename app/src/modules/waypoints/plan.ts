import { bearingDeg, cardinalOf, distanceMeters, type LatLon } from '@/core/geo/geo';
import { newEntity } from '@/core/model/entity';
import type { Id, Route, Track } from '@/core/model/types';
import { declinationAt } from '@/core/sensors/heading';
import { normalize } from '@/modules/declination/declination';

/** Una pierna: el tramo recto entre dos puntos de la ruta, con su distancia y su rumbo. */
export interface Leg {
  /** Número de pierna (1 = del punto 1 al 2). */
  n: number;
  distanceM: number;
  /** Rumbo geográfico (° respecto del norte verdadero). */
  trueBearing: number;
  /** Rumbo magnético (el que marca la brújula): el verdadero menos la declinación del lugar. */
  magneticBearing: number;
  cardinal: string;
}

/**
 * Las piernas de una ruta. El rumbo magnético usa la declinación en el punto
 * de partida de cada pierna (es la que corrige la brújula ahí).
 */
export function legsOf(line: LatLon[], declination: (lat: number, lon: number) => number = declinationAt): Leg[] {
  return line.slice(1).map((b, i) => {
    const a = line[i]!;
    const trueBearing = bearingDeg(a, b);
    return {
      n: i + 1,
      distanceM: distanceMeters(a, b),
      trueBearing,
      magneticBearing: normalize(trueBearing - declination(a.lat, a.lon)),
      cardinal: cardinalOf(trueBearing),
    };
  });
}

export const lineLength = (line: LatLon[]): number => legsOf(line, () => 0).reduce((n, l) => n + l.distanceM, 0);

/** Track para seguir una ruta planificada (el mismo modo "seguir un track"); no aparece en la lista de Tracks. */
export function trackFromRoute(route: Route, existing?: Track): Track {
  const line = route.line ?? [];
  const segments: Track['segments'] = [line.map((p) => [p.lat, p.lon, null])];
  const base = existing ?? newEntity<Track>({ name: route.name, desc: '', source: 'Ruta', link: null, segments, waypoints: [], distanceM: 0, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '', routeId: route.id });
  return { ...base, name: route.name, segments, distanceM: Math.round(lineLength(line)), routeId: route.id };
}

export const routeTrackId = (route: Route, tracks: Iterable<Track>): Id | undefined => [...tracks].find((t) => t.routeId === route.id)?.id;

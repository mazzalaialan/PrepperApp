/**
 * Lugares con aviso (lluvia y rayos) y la regla para no avisar dos veces: si
 * la última ubicación conocida ("donde estoy") está cerca de un waypoint con
 * aviso del mismo dispositivo, se ignora y avisa solo el waypoint.
 */

export const HERE_ID = 'here';
/** Más cerca que esto, "donde estoy" y el waypoint ven la misma lluvia y la misma tormenta. */
export const SAME_PLACE_KM = 10;

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rumbo inicial de `a` hacia `b`, en grados (0 = norte). */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface PlaceLike {
  device_id: string;
  place_id: string;
  lat: number;
  lon: number;
}

/** Saca "donde estoy" de cada dispositivo que tenga un waypoint con aviso a menos de `SAME_PLACE_KM`. */
export function withoutDuplicateHere<T extends PlaceLike>(places: T[]): T[] {
  return places.filter(
    (p) =>
      p.place_id !== HERE_ID ||
      !places.some((w) => w.device_id === p.device_id && w.place_id !== HERE_ID && distanceKm(p, w) < SAME_PLACE_KM),
  );
}

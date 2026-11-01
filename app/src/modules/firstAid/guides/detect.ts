import { distanceMeters } from '@/core/geo/geo';
import type { FirstAidEnv } from '@/core/settings/settings';
import { loadEmergencyData, type EmergencyData } from '@/modules/emergency/data';
import { loadPlaceFinder, type PlaceFinder } from '@/modules/emergency/places';

/**
 * ¿Ciudad o zona agreste? Se estima sin conexión con lo incluido en la app: el
 * centro de salud (Provincia de Buenos Aires), cuartel de bomberos (todo el
 * país; en muchos pueblos tienen la ambulancia) o localidad (casi siempre con
 * sala de primeros auxilios) más cercanos. Si lo más cercano está a más de una
 * hora en auto, la ayuda tarda: zona agreste.
 */

/** Más de esto hasta la ayuda más cercana: zona agreste. */
export const WILD_MINUTES = 60;
/** Los caminos no van en línea recta: ~30 % más de recorrido. */
const ROAD_FACTOR = 1.3;
const AVERAGE_KMH = 60;

export interface HelpEstimate {
  kind: 'health' | 'fire' | 'town';
  name: string;
  km: number;
  /** En auto, estimado. */
  minutes: number;
  env: FirstAidEnv;
}

export function minutesByCar(straightKm: number): number {
  return Math.round(((straightKm * ROAD_FACTOR) / AVERAGE_KMH) * 60);
}

export function nearestHelp(lat: number, lon: number, data: EmergencyData, places: PlaceFinder): HelpEstimate | null {
  const here = { lat, lon };
  const candidates: { kind: HelpEstimate['kind']; name: string; lat: number; lon: number }[] = [
    ...data.health.map((p) => ({ kind: 'health' as const, name: p.name, lat: p.lat, lon: p.lon })),
    ...data.fire.map((p) => ({ kind: 'fire' as const, name: p.name, lat: p.lat, lon: p.lon })),
  ];
  const town = places.nearestTown(lat, lon);
  if (town) candidates.push({ kind: 'town', name: town.label, lat: town.lat, lon: town.lon });
  let best: HelpEstimate | null = null;
  for (const c of candidates) {
    const km = distanceMeters(here, c) / 1000;
    if (!best || km < best.km) {
      const minutes = minutesByCar(km);
      best = { kind: c.kind, name: c.name, km, minutes, env: minutes > WILD_MINUTES ? 'wild' : 'city' };
    }
  }
  return best;
}

export async function estimateHelp(lat: number, lon: number): Promise<HelpEstimate | null> {
  const [data, places] = await Promise.all([loadEmergencyData(), loadPlaceFinder()]);
  return nearestHelp(lat, lon, data, places);
}

import { distanceMeters } from '@/core/geo/geo';
import type { Country, FirstAidEnv } from '@/core/settings/settings';
import { loadCountryData } from '@/modules/emergency/country';
import type { EmergencyData } from '@/modules/emergency/data';
import type { PlaceFinder } from '@/modules/emergency/places';

/**
 * ¿Ciudad o zona agreste? Se estima sin conexión con lo incluido en la app: el
 * centro de salud (Provincia de Buenos Aires), cuartel de bomberos (todo el
 * país; en muchos pueblos tienen la ambulancia) o localidad urbana más cercanos
 * (los caseríos no cuentan: no tienen ambulancia ni hospital). Si lo más
 * cercano está a más de una hora en auto, la ayuda tarda: zona agreste.
 */

/** Más de esto hasta la ayuda más cercana: zona agreste. */
export const WILD_MINUTES = 60;
/** Los caminos no van en línea recta: ~30 % más de recorrido. */
const ROAD_FACTOR = 1.3;
const AVERAGE_KMH = 60;
/** Parte de una ciudad (aglomerado) o con población conocida (tools/places-data). */
const URBAN_RANK = 3000;

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
  // Solo localidades urbanas: un caserío de pocas casas no tiene ambulancia ni hospital.
  const town = places.nearestTown(lat, lon, URBAN_RANK);
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

/** Con los datos del país (Argentina incluidos; Chile y Uruguay, su paquete). Lanza si no hay paquete ni conexión. */
export async function estimateHelp(lat: number, lon: number, country: Country): Promise<HelpEstimate | null> {
  const { emergency, places } = await loadCountryData(country);
  return nearestHelp(lat, lon, emergency, places);
}

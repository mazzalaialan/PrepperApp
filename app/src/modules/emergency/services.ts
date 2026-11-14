import type { ContactKind } from '@/core/model/types';
import { distanceMeters } from '@/core/geo/geo';
import type { Country } from '@/core/settings/settings';
import { forgetDataFile, hasDataFile, loadDataFile } from './dataFile';
import type { NearbyPlace, Place } from './data';

/**
 * Servicios que no son de emergencia para "Buscar cercanos": vehículos
 * (estaciones de servicio, gomerías, talleres), salud (farmacias,
 * desfibriladores, veterinarias), agua, refugios y cajeros y náutica (marinas, rampas, guarderías, alquiler, combustible y talleres para embarcaciones). Un archivo por
 * categoría y país (`data/<categoría>-<país>.json`, tools/services-data), que
 * se baja una vez con el país y queda guardado, como los paquetes por país.
 * Van aparte de los datos de emergencia para no agrandar la descarga inicial.
 */

export type ServiceCategory = 'fuel' | 'tyres' | 'repair' | 'pharmacy' | 'aed' | 'vet' | 'water' | 'shelter' | 'atm' | 'nautical';
export const SERVICE_CATEGORIES: ServiceCategory[] = ['fuel', 'tyres', 'repair', 'pharmacy', 'aed', 'vet', 'water', 'shelter', 'atm', 'nautical'];

/** Tipo de contacto de cada categoría (con el que se guarda y se dibuja). */
export const CATEGORY_KIND: Record<ServiceCategory, ContactKind> = {
  fuel: 'fuel',
  tyres: 'tyres',
  repair: 'carRepair',
  pharmacy: 'pharmacy',
  aed: 'aed',
  vet: 'vet',
  water: 'water',
  shelter: 'shelter',
  atm: 'atm',
  nautical: 'nautical',
};

/** Tipos de contacto que vienen de estos archivos (no son servicios de emergencia). */
export const SERVICE_KINDS = new Set<ContactKind>(Object.values(CATEGORY_KIND));

export interface ServiceData {
  country: Country;
  category: ServiceCategory;
  generatedAt: string;
  /** Sin listado oficial (todos menos las estaciones de Argentina): todos vienen de OpenStreetMap. */
  osm?: boolean;
  source: string;
  places: Place[];
}

const fileName = (category: ServiceCategory, country: Country) => `${category}-${country}.json`;
const loaded = new Map<string, Promise<ServiceData>>();

/** Los de una categoría y país (una sola carga por sesión; si falla, se reintenta la próxima vez). */
export function loadService(category: ServiceCategory, country: Country): Promise<ServiceData> {
  const file = fileName(category, country);
  let p = loaded.get(file);
  if (!p) {
    p = loadDataFile<ServiceData>(file).then(async (d) => {
      if (Array.isArray(d?.places)) return d;
      // Guardado con un formato que esta versión no entiende: se descarta y se vuelve a bajar.
      await forgetDataFile(file);
      const fresh = await loadDataFile<ServiceData>(file);
      if (!Array.isArray(fresh?.places)) throw new Error(`formato desconocido: ${file}`);
      return fresh;
    });
    loaded.set(file, p);
    p.catch(() => loaded.delete(file));
  }
  return p;
}

/**
 * Baja en segundo plano los que falten del país, para tenerlos sin conexión.
 * Los que ya están guardados no se leen (se actualizan cuando se usan).
 */
export async function prefetchServices(country: Country): Promise<void> {
  for (const category of SERVICE_CATEGORIES) {
    if (!(await hasDataFile(fileName(category, country)))) await loadService(category, country).catch(() => undefined);
  }
}

/** Los lugares del archivo, con su distancia (sin límite: el filtro de distancia lo hace la página). */
export function serviceNearby(data: ServiceData, lat: number, lon: number): NearbyPlace[] {
  const here = { lat, lon };
  const kind = CATEGORY_KIND[data.category];
  return data.places.map((p, i) => ({
    key: `${data.category}-${i}`,
    kind,
    name: p.name,
    phone: p.phone ?? '',
    address: p.address ?? '',
    lat: p.lat,
    lon: p.lon,
    distance: distanceMeters(here, p),
    source: data.osm || p.osm ? ('osm' as const) : ('official' as const),
    detail: p.type ?? '',
    ...(p.note ? { note: p.note } : {}),
    ...(p.fuels?.length ? { fuels: p.fuels } : {}),
  }));
}

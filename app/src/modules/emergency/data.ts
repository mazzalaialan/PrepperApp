import type { ContactKind } from '@/core/model/types';
import { distanceMeters } from '@/core/geo/geo';
import type { Country } from '@/core/settings/settings';
import { loadDataFile } from './dataFile';

/**
 * Datos de emergencia incluidos en la app (tools/emergency-data/build.mjs):
 * cuarteles de bomberos de todo el país, comisarías y salud de la Provincia
 * de Buenos Aires, y emisoras de Radio Nacional. Funcionan sin conexión.
 */

export interface Place {
  name: string;
  lat: number;
  lon: number;
  phone?: string;
  address?: string;
  type?: string;
}

export interface RadioStation {
  call: string;
  city: string;
  province: string;
  am: number | null;
  fm: number | null;
  lat: number;
  lon: number;
}

export interface EmergencyData {
  sources: Record<'fire' | 'police' | 'health' | 'radio', string>;
  /** Paquetes de Chile y Uruguay: lugares de OpenStreetMap, no de un listado oficial. */
  osm?: boolean;
  fire: Place[];
  police: Place[];
  health: Place[];
  radio: RadioStation[];
}

let pending: Promise<EmergencyData> | null = null;

export function loadEmergencyData(): Promise<EmergencyData> {
  pending ??= import('./emergency-data.json').then((m) => m.default as EmergencyData);
  return pending;
}

/** Lugar encontrado cerca, de cualquier fuente. */
export interface NearbyPlace {
  key: string;
  kind: ContactKind;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lon: number;
  distance: number;
  source: 'official' | 'osm';
  /** Tipo según la fuente (p. ej. "Hospital", "C.A.P.S"). */
  detail: string;
  /** Otros teléfonos (emergencias del parque, radioestación). */
  extraPhones?: ParkPhone[];
  /** Aclaración (p. ej. internos y otros números de la intendencia). */
  note?: string;
  /** Frecuencias VHF que publica el parque donde está el lugar. */
  radio?: ParkRadio[];
}

// ---------- Parques nacionales (tools/emergency-data/parks.mjs) ----------

export interface ParkPhone {
  label: string;
  phone: string;
}

export interface ParkRadio {
  freq: string;
  label: string;
  /** Dónde la publica el parque (mapa, folleto, cartel). */
  source: string;
}

export interface Park {
  name: string;
  /** Página del área (argentina.gob.ar o conaf.cl). */
  url: string;
  /** Quién atiende el teléfono principal, si no es la intendencia (Chile: "CONAF Magallanes"). */
  office?: string;
  address: string;
  /** Número para llamar a la intendencia ('' si la página no publica uno). */
  phone: string;
  /** Texto completo de los teléfonos según la página (internos, otros números). */
  phones: string;
  emergency?: ParkPhone[];
  radio?: ParkRadio[];
  /** Intendencia (ubicada por localidad). */
  lat: number;
  lon: number;
  /** Polígonos: anillos de [lon, lat]; el primero es el borde, los demás, huecos. */
  area: [number, number][][][];
}

export interface ParksData {
  source: string;
  parks: Park[];
}

let parksAR: Promise<ParksData> | null = null;
let parksCL: Promise<ParksData> | null = null;

const loadParksAR = () => (parksAR ??= import('./parks-data.json').then((m) => m.default as unknown as ParksData));
/** Chile (CONAF): archivo aparte, se baja una vez y queda guardado como los paquetes por país. */
export function loadParksCL(): Promise<ParksData> {
  parksCL ??= loadDataFile<ParksData>('parks-CL.json');
  // Si falla (sin conexión y sin bajar), se reintenta la próxima vez.
  parksCL.catch(() => (parksCL = null));
  return parksCL;
}

/**
 * Parques de Argentina y Chile juntos (en la cordillera se está a pocos km
 * del otro país); Uruguay, ninguno. Si el archivo de Chile no está bajado y
 * no hay conexión, solo los de Argentina.
 */
export async function loadParks(country: Country): Promise<ParksData> {
  if (country !== 'AR' && country !== 'CL') return { source: '', parks: [] };
  const [ar, cl] = await Promise.all([loadParksAR(), loadParksCL().catch(() => null)]);
  return { source: [ar.source, cl?.source].filter(Boolean).join(' '), parks: [...ar.parks, ...(cl?.parks ?? [])] };
}

function inRing(ring: [number, number][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPark(park: Park, lat: number, lon: number): boolean {
  return park.area.some(([outer, ...holes]) => !!outer && inRing(outer, lon, lat) && !holes.some((h) => inRing(h, lon, lat)));
}

/** Distancia aproximada al borde del parque (a sus vértices): 0 si se está adentro. */
export function distanceToPark(park: Park, lat: number, lon: number): number {
  if (inPark(park, lat, lon)) return 0;
  let best = Infinity;
  for (const poly of park.area) for (const [x, y] of poly[0] ?? []) best = Math.min(best, distanceMeters({ lat, lon }, { lat: y, lon: x }));
  return best;
}

/** Parques donde se está o a menos de `maxM` del borde, del más cercano al más lejano. */
export function parksNear(data: ParksData, lat: number, lon: number, maxM: number): { park: Park; distance: number }[] {
  return data.parks
    .map((park) => ({ park, distance: distanceToPark(park, lat, lon) }))
    .filter((p) => p.distance <= maxM)
    .sort((a, b) => a.distance - b.distance);
}

/** Lugares de Parques Nacionales en los datos oficiales (seccionales, destacamentos, guardaparques). */
const isParkOffice = (p: NearbyPlace) => /parques nacionales|guardaparque|conaf|ranger/i.test(`${p.detail} ${p.name}`);

/**
 * Suma las intendencias de los parques (con teléfono o dirección) y les pasa
 * las frecuencias del parque a las seccionales que están adentro.
 */
export function withParks(places: NearbyPlace[], parks: ParksData, lat: number, lon: number): NearbyPlace[] {
  const withRadio = parks.parks.filter((p) => p.radio?.length);
  const out = places.map((p) => {
    if (!isParkOffice(p)) return p;
    const park = withRadio.find((k) => inPark(k, p.lat, p.lon));
    return park ? { ...p, radio: park.radio } : p;
  });
  // Dos áreas con la misma intendencia u oficina (Nahuel Huapi y Los Arrayanes; en Chile, una oficina regional de CONAF para varias áreas): una sola fila, con las frecuencias de todas.
  const rows = new Map<string, NearbyPlace>();
  parks.parks.forEach((park, i) => {
    if (!park.phone && !park.address) return;
    const key = `${park.lat},${park.lon},${park.office ?? ''}`;
    const twin = rows.get(key);
    if (twin) {
      // La fila lleva el nombre de la oficina, no el de una de las áreas.
      if (park.office) twin.name = park.office;
      for (const r of park.radio ?? []) if (!twin.radio?.some((x) => x.freq === r.freq && x.label === r.label)) twin.radio = [...(twin.radio ?? []), r];
      return;
    }
    const row: NearbyPlace = {
      key: `park-${i}`,
      kind: 'police',
      name: `${park.office ?? 'Intendencia'} · ${park.name}`,
      phone: park.phone,
      address: park.address,
      lat: park.lat,
      lon: park.lon,
      distance: distanceMeters({ lat, lon }, park),
      source: 'official',
      detail: park.url.includes('conaf.cl') ? 'CONAF' : 'Administración de Parques Nacionales',
      ...(park.phones && park.phones.replace(/\D/g, '') !== park.phone.replace(/\D/g, '') && { note: park.phones }),
      ...(park.emergency && { extraPhones: park.emergency }),
      ...(park.radio && { radio: park.radio }),
    };
    rows.set(key, row);
    out.push(row);
  });
  return out;
}

/** Del dataset de salud: hospitales y guardias, por un lado; centros de atención primaria, por otro. */
const healthKind = (type = ''): ContactKind => (/hospital|emergencias|u\.p\.a/i.test(type) ? 'hospital' : 'medical');

export function officialNearby(data: EmergencyData, lat: number, lon: number, radiusM: number): NearbyPlace[] {
  const here = { lat, lon };
  const out: NearbyPlace[] = [];
  const add = (p: Place, kind: ContactKind, prefix: string, i: number) => {
    const distance = distanceMeters(here, p);
    if (distance > radiusM) return;
    out.push({
      key: `${prefix}-${i}`,
      kind,
      name: p.name,
      phone: p.phone ?? '',
      address: p.address ?? '',
      lat: p.lat,
      lon: p.lon,
      distance,
      source: data.osm ? 'osm' : 'official',
      detail: p.type ?? '',
    });
  };
  const key = data.osm ? 'pkg-' : '';
  data.fire.forEach((p, i) => add(p, 'fire', `${key}fire`, i));
  data.police.forEach((p, i) => add(p, 'police', `${key}police`, i));
  data.health.forEach((p, i) => add(p, healthKind(p.type), `${key}health`, i));
  return out;
}

/**
 * Junta las fuentes: si el mismo lugar aparece en las dos (mismo tipo, a
 * menos de 150 m), queda uno solo, completando teléfono y dirección con lo
 * que falte.
 */
export function mergeNearby(official: NearbyPlace[], osm: NearbyPlace[]): NearbyPlace[] {
  const merged = [...official];
  const sameKind = (a: ContactKind, b: ContactKind) => a === b || (['hospital', 'medical'].includes(a) && ['hospital', 'medical'].includes(b));
  for (const o of osm) {
    const twin = merged.find((m) => sameKind(m.kind, o.kind) && distanceMeters(m, o) < 150);
    if (twin) {
      twin.phone ||= o.phone;
      twin.address ||= o.address;
    } else merged.push(o);
  }
  return merged.sort((a, b) => a.distance - b.distance);
}

/** Grupo de cada tipo para "lo más cercano": hospitales y ambulancias van juntos (salud). */
export const nearbyGroup = (k: ContactKind) => (k === 'hospital' || k === 'medical' ? 'health' : k);

/** Los `count` más cercanos de cada grupo (policía, bomberos, salud, defensa civil), del más cercano al más lejano. */
export function nearestPerKind(places: NearbyPlace[], count: number): NearbyPlace[] {
  const taken = new Map<string, number>();
  const out: NearbyPlace[] = [];
  for (const p of [...places].sort((a, b) => a.distance - b.distance)) {
    const g = nearbyGroup(p.kind);
    const n = taken.get(g) ?? 0;
    if (n >= count) continue;
    taken.set(g, n + 1);
    out.push(p);
  }
  return out;
}

export function nearestRadio(data: EmergencyData, lat: number, lon: number, count = 3): (RadioStation & { distance: number })[] {
  return data.radio
    .map((r) => ({ ...r, distance: distanceMeters({ lat, lon }, r) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

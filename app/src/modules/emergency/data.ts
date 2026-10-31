import type { ContactKind } from '@/core/model/types';
import { distanceMeters } from '@/core/geo/geo';

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
      source: 'official',
      detail: p.type ?? '',
    });
  };
  data.fire.forEach((p, i) => add(p, 'fire', 'fire', i));
  data.police.forEach((p, i) => add(p, 'police', 'police', i));
  data.health.forEach((p, i) => add(p, healthKind(p.type), 'health', i));
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

export function nearestRadio(data: EmergencyData, lat: number, lon: number, count = 3): (RadioStation & { distance: number })[] {
  return data.radio
    .map((r) => ({ ...r, distance: distanceMeters({ lat, lon }, r) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

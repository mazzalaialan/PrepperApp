import { distanceMeters } from '@/core/geo/geo';
import type { ContactKind } from '@/core/model/types';
import type { NearbyPlace } from './data';

/**
 * Consultas a OpenStreetMap, solo con conexión y solo cuando el usuario lo
 * pide (políticas de uso de Overpass y Nominatim: pocas consultas y
 * puntuales).
 * - Overpass: comisarías, bomberos, hospitales y centros de salud cercanos;
 *   calles, rutas y mojones alrededor de un punto.
 * - Nominatim: dirección de un punto.
 */

/** Servidores públicos de Overpass: si el principal está saturado o rechaza el pedido, se prueba el espejo. */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 30_000;

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown = null;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const pos = (e: OsmElement) => (e.lat !== undefined ? { lat: e.lat, lon: e.lon! } : e.center ?? null);

export function osmKind(tags: Record<string, string>): ContactKind | null {
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'fire_station') return 'fire';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'clinic' || tags.amenity === 'doctors' || tags.emergency === 'ambulance_station') return 'medical';
  if (/defensa civil|protecci[oó]n civil/i.test(tags.name ?? '')) return 'civilDefense';
  return null;
}

export function osmAddress(tags: Record<string, string>): string {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return [street, tags['addr:city'] ?? tags['addr:suburb']].filter(Boolean).join(', ');
}

export function parseNearby(elements: OsmElement[], lat: number, lon: number): NearbyPlace[] {
  const out: NearbyPlace[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const kind = osmKind(tags);
    const p = pos(e);
    if (!kind || !p) continue;
    out.push({
      key: `osm-${e.type}-${e.id}`,
      kind,
      name: tags.name ?? tags.official_name ?? '',
      phone: tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? '',
      address: osmAddress(tags),
      lat: p.lat,
      lon: p.lon,
      distance: distanceMeters({ lat, lon }, p),
      source: 'osm',
      detail: tags.healthcare ?? tags.amenity ?? tags.emergency ?? '',
    });
  }
  return out;
}

export async function fetchOsmNearby(lat: number, lon: number, radiusM: number): Promise<NearbyPlace[]> {
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const query = `[out:json][timeout:25];(
    nwr["amenity"~"^(police|fire_station|hospital|clinic)$"]${around};
    nwr["emergency"="ambulance_station"]${around};
    nwr["office"="government"]["name"~"Defensa Civil|Protecci.n Civil",i]${around};
  );out center tags;`;
  return parseNearby(await overpass(query), lat, lon);
}

// ---------- Dónde estoy, para los socorristas ----------

export interface LocationInfo {
  /** Calle y altura según Nominatim, o el nombre del lugar. */
  address: string;
  locality: string;
  /** Las dos calles con nombre más cercanas además de la propia. */
  nearbyStreets: string[];
  /** Rutas cercanas (p. ej. "RN 40"). */
  roads: string[];
  /** Mojón kilométrico más cercano, si hay alguno cargado. */
  milestone: { km: string; road: string; distance: number } | null;
}

interface NominatimReverse {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

export function describeAddress(r: NominatimReverse): { address: string; locality: string; road: string } {
  const a = r.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
  const address = [road, a.house_number].filter(Boolean).join(' ') || r.name || '';
  const locality = [a.suburb ?? a.neighbourhood ?? a.hamlet, a.city ?? a.town ?? a.village ?? a.municipality, a.state].filter(Boolean).join(', ');
  return { address, locality, road };
}

export function parseSurroundings(elements: OsmElement[], lat: number, lon: number, ownRoad: string): Omit<LocationInfo, 'address' | 'locality'> {
  const here = { lat, lon };
  const streets = new Map<string, number>();
  const roads = new Map<string, number>();
  let milestone: LocationInfo['milestone'] = null;
  for (const e of elements) {
    const tags = e.tags ?? {};
    const p = pos(e);
    if (!p) continue;
    const d = distanceMeters(here, p);
    if (tags.highway === 'milestone') {
      const km = tags.distance ?? tags.pk ?? tags.name ?? '';
      if (km && (!milestone || d < milestone.distance)) milestone = { km, road: tags.ref ?? tags['highway:ref'] ?? '', distance: d };
      continue;
    }
    if (tags.ref && /^(motorway|trunk|primary|secondary|tertiary)/.test(tags.highway ?? '')) {
      for (const ref of tags.ref.split(';').map((s) => s.trim())) if (!roads.has(ref) || d < roads.get(ref)!) roads.set(ref, d);
    }
    if (tags.name && tags.name !== ownRoad && !/^(footway|path|steps|cycleway|service)$/.test(tags.highway ?? '')) {
      if (!streets.has(tags.name) || d < streets.get(tags.name)!) streets.set(tags.name, d);
    }
  }
  const byDistance = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  return { nearbyStreets: byDistance(streets).slice(0, 2), roads: byDistance(roads).slice(0, 2), milestone };
}

export async function describeLocation(lat: number, lon: number, lang: string): Promise<LocationInfo> {
  const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(6), lon: lon.toFixed(6), zoom: '18', addressdetails: '1', 'accept-language': lang });
  const [reverse, around] = await Promise.all([
    fetch(`${NOMINATIM}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => (r.ok ? (r.json() as Promise<NominatimReverse>) : {})),
    overpass(`[out:json][timeout:25];(
      way(around:120,${lat.toFixed(6)},${lon.toFixed(6)})["highway"]["name"];
      way(around:400,${lat.toFixed(6)},${lon.toFixed(6)})["highway"]["ref"];
      node(around:3000,${lat.toFixed(6)},${lon.toFixed(6)})["highway"="milestone"];
    );out center tags;`).catch(() => [] as OsmElement[]),
  ]);
  const { address, locality, road } = describeAddress(reverse);
  return { address, locality, ...parseSurroundings(around, lat, lon, road) };
}

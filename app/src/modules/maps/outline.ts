import type { FeatureCollection } from 'geojson';
import type { GeoData } from '@/modules/weathermap/geo';

/**
 * Contorno de referencia sin teselas (el del mapa de tiempo): provincias y,
 * aparte, las fronteras y costas de todos los países de América del Sur, para
 * dibujarlas de otro color.
 */
export function outlineFeatures(geo: GeoData): FeatureCollection {
  const line = (kind: 'country' | 'province', rings: number[][]) => ({
    type: 'Feature' as const,
    properties: { kind },
    geometry: { type: 'MultiLineString' as const, coordinates: rings.map((ring) => Array.from({ length: ring.length / 2 }, (_, i) => [ring[i * 2]!, ring[i * 2 + 1]!])) },
  });
  return {
    type: 'FeatureCollection',
    features: [...geo.regions.map((r) => line('province', r.rings)), ...[...geo.borders, ...geo.neighbors].map((b) => line('country', b.rings))],
  };
}

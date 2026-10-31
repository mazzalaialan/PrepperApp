/** Mapa base incluido en la app (tools/geo-data/build.mjs). Se carga aparte para no pesar en el inicio. */

export interface GeoRegion {
  id: string;
  country: 'AR' | 'CL' | 'UY';
  name: string;
  label: [number, number];
  /** Anillos como [lon, lat, lon, lat, …]. */
  rings: number[][];
}

export interface Capital {
  name: string;
  country: 'AR' | 'CL' | 'UY';
  national: boolean;
  lon: number;
  lat: number;
}

export interface Volcano {
  id: number;
  name: string;
  lon: number;
  lat: number;
  elevation: number | null;
  /** Año de la última erupción conocida (negativo: antes de Cristo), o `null` si no se sabe. */
  lastEruption: number | null;
  type: string | null;
  country: string;
}

export interface GeoData {
  source: string;
  regions: GeoRegion[];
  neighbors: { code: string; rings: number[][] }[];
  capitals: Capital[];
  volcanoes: Volcano[];
}

let pending: Promise<GeoData> | null = null;

export function loadGeoData(): Promise<GeoData> {
  pending ??= import('./geo-data.json').then((m) => m.default as GeoData);
  return pending;
}

/**
 * Coordenadas UTM (WGS84), sin librerías: serie de Krüger de cuarto orden (error de milímetros
 * dentro de la zona). Sirven para la grilla y los rótulos del mapa topográfico impreso.
 */
import type { LatLon } from './geo';

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E0 = 500_000;
const N0_SOUTH = 10_000_000;
const n = F / (2 - F);
const n2 = n * n;
const n3 = n2 * n;
const n4 = n3 * n;
const RECT = (A / (1 + n)) * (1 + n2 / 4 + n4 / 64);
const ALPHA = [
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
  (61 * n3) / 240 - (103 * n4) / 140,
  (49561 * n4) / 161280,
];
const BETA = [
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440,
  (17 * n3) / 480 - (37 * n4) / 840,
  (4397 * n4) / 161280,
];
const DELTA = [
  2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
  (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
  (56 * n3) / 15 - (136 * n4) / 35,
  (4279 * n4) / 630,
];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface Utm {
  zone: number;
  hemisphere: 'N' | 'S';
  /** Letra de banda de latitud (C a X; en Argentina F a H). */
  band: string;
  easting: number;
  northing: number;
}

/** Zona UTM (1 a 60) de una longitud. */
export function utmZone(lon: number): number {
  return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
}

const centralMeridian = (zone: number) => -183 + 6 * zone;
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
const utmBand = (lat: number) => BANDS[Math.min(19, Math.max(0, Math.floor((lat + 80) / 8)))]!;

/** De latitud y longitud a UTM (si no se indica la zona, la de la longitud). */
export function toUtm(p: LatLon, zone = utmZone(p.lon)): Utm {
  const lon0 = rad(centralMeridian(zone));
  const phi = rad(p.lat);
  const dl = rad(p.lon) - lon0;
  const q = ((2 * Math.sqrt(n)) / (1 + n));
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - q * Math.atanh(q * Math.sin(phi)));
  const xi0 = Math.atan2(t, Math.cos(dl));
  const eta0 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let xi = xi0;
  let eta = eta0;
  ALPHA.forEach((a, i) => {
    const j = 2 * (i + 1);
    xi += a * Math.sin(j * xi0) * Math.cosh(j * eta0);
    eta += a * Math.cos(j * xi0) * Math.sinh(j * eta0);
  });
  const south = p.lat < 0;
  return { zone, hemisphere: south ? 'S' : 'N', band: utmBand(p.lat), easting: E0 + K0 * RECT * eta, northing: (south ? N0_SOUTH : 0) + K0 * RECT * xi };
}

/** De UTM a latitud y longitud. */
export function fromUtm(u: Pick<Utm, 'zone' | 'hemisphere' | 'easting' | 'northing'>): LatLon {
  const xi = (u.northing - (u.hemisphere === 'S' ? N0_SOUTH : 0)) / (K0 * RECT);
  const eta = (u.easting - E0) / (K0 * RECT);
  let xi0 = xi;
  let eta0 = eta;
  BETA.forEach((b, i) => {
    const j = 2 * (i + 1);
    xi0 -= b * Math.sin(j * xi) * Math.cosh(j * eta);
    eta0 -= b * Math.cos(j * xi) * Math.sinh(j * eta);
  });
  const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0));
  let phi = chi;
  DELTA.forEach((d, i) => {
    phi += d * Math.sin(2 * (i + 1) * chi);
  });
  const lam = rad(centralMeridian(u.zone)) + Math.atan2(Math.sinh(eta0), Math.cos(xi0));
  return { lat: deg(phi), lon: deg(lam) };
}

/** «19G 295 436 E 5 450 120 N» (metros, redondeados). */
export function formatUtm(u: Utm): string {
  const grp = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${u.zone}${u.band} ${grp(u.easting)} E ${grp(u.northing)} N`;
}

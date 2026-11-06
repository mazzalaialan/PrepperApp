/**
 * Cálculos geográficos sobre la esfera (radio medio terrestre). Para las
 * distancias de a pie que maneja la app el error frente al elipsoide es < 0,5 %.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Normaliza un ángulo a [0, 360). */
export function normalizeDeg(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Distancia por círculo máximo (haversine), en metros. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo geográfico inicial de `a` hacia `b`, en grados [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(deg(Math.atan2(y, x)));
}

export const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Cardinal = (typeof CARDINALS)[number];

/** Punto cardinal más cercano (8 rumbos). */
export function cardinalOf(bearing: number): Cardinal {
  return CARDINALS[Math.round(normalizeDeg(bearing) / 45) % 8]!;
}

export function isValidLatLon({ lat, lon }: LatLon): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

type Token = { hemi: string } | { num: number };

/**
 * Lee coordenadas escritas o pegadas en los formatos habituales:
 * - decimal: `-34.6037, -58.3816` (como copia Google Maps) o `-34,6037 -58,3816`
 * - con hemisferio detrás o delante: `34.6037 S 58.3816 W`, `S 34.6037 O 58.3816`
 * - grados, minutos y segundos: `34°36'13"S 58°22'54"W`, `34 36 13 S 58 22 54 O`
 * - grados y minutos decimales: `34°36.217'S 58°22.9'W`
 * "O" (oeste) se acepta además de "W".
 */
export function parseCoordinates(text: string): LatLon | null {
  let s = text.trim().replace(/[°º˚′'’″"]/g, ' ');
  if (!s) return null;
  // Coma decimal: "−34,6037 −58,3816" o "−34,6037; −58,3816" (sin otra coma que separe los valores).
  const commas = (s.match(/,/g) ?? []).length;
  const separatorComma = /\d,\s/.test(s) || (commas === 1 && !/\d,\d/.test(s));
  if (!separatorComma) s = s.replace(/(\d),(\d)/g, '$1.$2');

  const tokens: Token[] = [];
  for (const raw of s.replace(/([NSEWO])/gi, ' $1 ').split(/[\s,;]+/).filter(Boolean)) {
    if (/^[NSEWO]$/i.test(raw)) tokens.push({ hemi: raw.toUpperCase() === 'O' ? 'W' : raw.toUpperCase() });
    else if (Number.isFinite(Number(raw))) tokens.push({ num: Number(raw) });
    else return null;
  }

  const groups = groupTokens(tokens);
  if (!groups) return null;

  let lat: number | null = null;
  let lon: number | null = null;
  for (const [i, g] of groups.entries()) {
    const value = toDecimal(g.nums);
    if (Number.isNaN(value)) return null;
    if (g.hemi === 'N' || g.hemi === 'S') {
      if (lat !== null) return null;
      lat = g.hemi === 'S' ? -Math.abs(value) : Math.abs(value);
    } else if (g.hemi === 'E' || g.hemi === 'W') {
      if (lon !== null) return null;
      lon = g.hemi === 'W' ? -Math.abs(value) : Math.abs(value);
    } else if (i === 0) {
      lat = value;
    } else {
      lon = value;
    }
  }
  if (lat === null || lon === null) return null;
  const result = { lat, lon };
  return isValidLatLon(result) ? result : null;
}

/** Separa en dos grupos de números (latitud y longitud), cada uno con su hemisferio si lo tiene. */
function groupTokens(tokens: Token[]): { nums: number[]; hemi: string | null }[] | null {
  const hemis = tokens.filter((t) => 'hemi' in t).length;
  const nums = tokens.flatMap((t) => ('num' in t ? [t.num] : []));

  if (hemis === 0) {
    // Sin hemisferios: mitades (2 → decimal, 4 → grados y minutos, 6 → GMS).
    if (![2, 4, 6].includes(nums.length)) return null;
    const half = nums.length / 2;
    return [
      { nums: nums.slice(0, half), hemi: null },
      { nums: nums.slice(half), hemi: null },
    ];
  }
  if (hemis !== 2) return null;

  const groups: { nums: number[]; hemi: string | null }[] = [];
  const prefix = 'hemi' in tokens[0]!;
  let current: number[] = [];
  for (const t of tokens) {
    if ('hemi' in t) {
      if (prefix) groups.push({ nums: [], hemi: t.hemi });
      else {
        groups.push({ nums: current, hemi: t.hemi });
        current = [];
      }
    } else if (prefix) {
      groups[groups.length - 1]!.nums.push(t.num);
    } else {
      current.push(t.num);
    }
  }
  if (current.length) return null; // números sueltos después del último hemisferio
  return groups.every((g) => g.nums.length >= 1 && g.nums.length <= 3) ? groups : null;
}

/** [g], [g, m] o [g, m, s] → grados decimales (el signo lo lleva el primer valor). */
function toDecimal(nums: number[]): number {
  const [d, m = 0, sec = 0] = nums;
  if (d === undefined || m < 0 || m >= 60 || sec < 0 || sec >= 60) return NaN;
  if (nums.length > 1 && !Number.isInteger(d)) return NaN;
  if (nums.length > 2 && !Number.isInteger(m)) return NaN;
  const sign = d < 0 || Object.is(d, -0) ? -1 : 1;
  return sign * (Math.abs(d) + m / 60 + sec / 3600);
}

/** Decimal con 6 decimales (~10 cm), con punto: el formato que entienden todas las apps. */
export function formatDecimal({ lat, lon }: LatLon): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/** Grados, minutos y segundos; `west` permite "O" en español. */
export function formatDms({ lat, lon }: LatLon, west = 'W'): string {
  const part = (value: number, pos: string, neg: string) => {
    // Se redondea en décimas de segundo enteras para que nunca aparezca 60″ o 60′.
    const tenths = Math.round(Math.abs(value) * 36_000);
    const d = Math.floor(tenths / 36_000);
    const m = Math.floor((tenths % 36_000) / 600);
    const s = (tenths % 600) / 10;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″ ${value < 0 ? neg : pos}`;
  };
  return `${part(lat, 'N', 'S')} ${part(lon, 'E', west)}`;
}

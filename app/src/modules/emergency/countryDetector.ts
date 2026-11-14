import { COUNTRIES, type Country } from '@/core/settings/settings';
import { countryAt, distanceToCountry, type BordersData } from './borders';

/** Cerca de la frontera sirven los datos de los dos lados: hasta esta distancia de otro país se cuentan también los suyos. */
export const NEAR_BORDER_M = 50_000;

export interface DetectedCountries {
  /** El país donde cae el lugar. */
  country: Country;
  /** Los otros países de la app a menos de 50 km de su frontera. */
  near: Country[];
}

/** El país del lugar (por las fronteras) y los vecinos cercanos. `null` si no cae en ningún país de la app (ni a menos de 20 km de uno). */
export function detectCountries(borders: BordersData, lat: number, lon: number): DetectedCountries | null {
  const country = countryAt(borders, lat, lon);
  if (!country) return null;
  const near = COUNTRIES.filter(
    (c) => c !== country && borders[c] && distanceToCountry(borders, c as Parameters<typeof distanceToCountry>[1], lat, lon) <= NEAR_BORDER_M,
  );
  return { country, near };
}

/** Celda de ~10 km (0,1°): mientras la ubicación siga en la misma celda no se recalcula nada. */
export const cellKey = (lat: number, lon: number): string => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;

export const sameDetection = (a: DetectedCountries | null, b: DetectedCountries | null): boolean =>
  !!a && !!b && a.country === b.country && a.near.length === b.near.length && a.near.every((c) => b.near.includes(c));

export interface DetectorOptions {
  /** Las fronteras (se cargan recién la primera vez que hace falta). */
  load: () => Promise<BordersData>;
  /** Lo que hay guardado hasta ahora: solo se avisa si el resultado es distinto. */
  current: () => DetectedCountries | null;
  onChange: (d: DetectedCountries) => void;
  /** Espera tras la última ubicación antes de calcular (el GPS manda una por segundo). */
  debounceMs?: number;
}

/**
 * Detecta el país cuando llega una ubicación. Pensado para gastar lo mínimo: espera a que la ubicación se calme (*debounce*),
 * se salta las que caen en la misma celda de ~10 km y avisa solo si el país (o los vecinos cercanos) cambió.
 */
export function createCountryDetector(opts: DetectorOptions): { note: (lat: number, lon: number) => void; cancel: () => void } {
  const wait = opts.debounceMs ?? 1500;
  let lastCell: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { lat: number; lon: number } | null = null;
  async function run() {
    timer = null;
    if (!pending) return;
    const { lat, lon } = pending;
    pending = null;
    const cell = cellKey(lat, lon);
    if (cell === lastCell) return;
    lastCell = cell;
    let borders: BordersData;
    try {
      borders = await opts.load();
    } catch {
      lastCell = null; // se reintenta con la próxima ubicación
      return;
    }
    const d = detectCountries(borders, lat, lon);
    if (d && !sameDetection(d, opts.current())) opts.onChange(d);
  }
  return {
    note(lat, lon) {
      // La misma celda que la última calculada y nada pendiente: no hace falta ni armar el temporizador.
      if (!pending && cellKey(lat, lon) === lastCell) return;
      pending = { lat, lon };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

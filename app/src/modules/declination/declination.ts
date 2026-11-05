import { MODEL_EPOCH, MODEL_VALID_UNTIL } from 'magvar';
import { declinationAt } from '@/core/sensors/heading';

/**
 * Declinómetro: declinación magnética de un lugar (modelo WMM, sin conexión),
 * su cambio anual, conversión de rumbos y la cuenta para un mapa de papel viejo.
 * Convención: declinación Este positiva, Oeste negativa.
 *   verdadero = magnético + declinación
 *   magnético = verdadero − declinación
 */

export { MODEL_EPOCH, MODEL_VALID_UNTIL };

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Año con decimales (2026.5 = mitad de 2026). */
export function decimalYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const next = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (next - start);
}

export interface DeclinationInfo {
  /** Grados; Este positivo. */
  value: number;
  /** Cambio por año, en grados (positivo = se corre hacia el Este). */
  annual: number;
  /** La fecha está dentro del período del modelo. */
  valid: boolean;
}

export function declinationInfo(lat: number, lon: number, altMeters: number | null = 0, when = new Date()): DeclinationInfo {
  const value = declinationAt(lat, lon, altMeters, when);
  // El cambio anual, con la fecha de un año después (o antes, si se pasa del modelo).
  const later = new Date(when.getTime() + YEAR_MS);
  const other = decimalYear(later) <= MODEL_VALID_UNTIL ? later : new Date(when.getTime() - YEAR_MS);
  const sign = other > when ? 1 : -1;
  const annual = sign * (declinationAt(lat, lon, altMeters, other) - value);
  const y = decimalYear(when);
  return { value, annual, valid: y >= MODEL_EPOCH && y <= MODEL_VALID_UNTIL };
}

export const normalize = (b: number) => ((b % 360) + 360) % 360;

/** De la brújula al mapa. */
export const magneticToTrue = (magnetic: number, declination: number) => normalize(magnetic + declination);
/** Del mapa a la brújula. */
export const trueToMagnetic = (trueBearing: number, declination: number) => normalize(trueBearing - declination);

/**
 * Declinación de hoy según lo que dice el margen de un mapa: la del año del
 * mapa más la variación anual por los años que pasaron (los dos con su signo).
 */
export function mapDeclinationToday(mapDeclination: number, mapYear: number, annualMinutes: number, when = new Date()): number {
  return mapDeclination + (annualMinutes / 60) * (decimalYear(when) - mapYear);
}

/** Cuántos metros te desviás por cada km si no corregís la declinación. */
export const metersOffPerKm = (declination: number) => Math.abs(Math.tan((declination * Math.PI) / 180)) * 1000;

/** Grados y minutos (sin signo): 6.5 → [6, 30]. */
export function degMin(value: number): [number, number] {
  const abs = Math.abs(value);
  let d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  return [d, m];
}

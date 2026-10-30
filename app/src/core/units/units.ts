/**
 * Magnitudes físicas se guardan siempre en SI (gramos, metros) y se convierten
 * solo para mostrar. Las unidades de cantidad de los artículos son texto libre
 * y no pasan por acá.
 */

export type UnitSystem = 'metric' | 'imperial';

const GRAMS_PER_POUND = 453.59237;
const GRAMS_PER_OUNCE = GRAMS_PER_POUND / 16;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;

function fmt(value: number, locale: string, maxDecimals: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals }).format(value);
}

export function formatWeight(grams: number, system: UnitSystem, locale: string): string {
  if (system === 'imperial') {
    return grams < GRAMS_PER_POUND
      ? `${fmt(grams / GRAMS_PER_OUNCE, locale, 1)} oz`
      : `${fmt(grams / GRAMS_PER_POUND, locale, 2)} lb`;
  }
  return grams < 1000 ? `${fmt(grams, locale, 0)} g` : `${fmt(grams / 1000, locale, 2)} kg`;
}

export type WeightUnit = 'g' | 'kg' | 'oz' | 'lb';

export function toGrams(value: number, unit: WeightUnit): number {
  switch (unit) {
    case 'g':
      return value;
    case 'kg':
      return value * 1000;
    case 'oz':
      return value * GRAMS_PER_OUNCE;
    case 'lb':
      return value * GRAMS_PER_POUND;
  }
}

export function formatDistance(meters: number, system: UnitSystem, locale: string): string {
  if (system === 'imperial') {
    const feet = meters / METERS_PER_FOOT;
    return feet < 1000 ? `${fmt(feet, locale, 0)} ft` : `${fmt(meters / METERS_PER_MILE, locale, 2)} mi`;
  }
  return meters < 1000 ? `${fmt(meters, locale, 0)} m` : `${fmt(meters / 1000, locale, 2)} km`;
}

/** Altitudes: siempre en la unidad chica (m o ft). */
export function formatAltitude(meters: number, system: UnitSystem, locale: string): string {
  return system === 'imperial' ? `${fmt(meters / METERS_PER_FOOT, locale, 0)} ft` : `${fmt(meters, locale, 0)} m`;
}

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

/** Gramos → valor editable en la unidad más cómoda del sistema (para precargar formularios). */
export function weightForInput(grams: number | null, system: UnitSystem): { value: string; unit: WeightUnit } {
  if (grams === null) return { value: '', unit: system === 'imperial' ? 'oz' : 'g' };
  if (system === 'imperial') {
    const lb = grams / GRAMS_PER_POUND;
    return lb >= 1
      ? { value: String(+lb.toFixed(2)), unit: 'lb' }
      : { value: String(+(grams / GRAMS_PER_OUNCE).toFixed(1)), unit: 'oz' };
  }
  return grams >= 1000 ? { value: String(+(grams / 1000).toFixed(3)), unit: 'kg' } : { value: String(+grams.toFixed(0)), unit: 'g' };
}

export function weightUnitsFor(system: UnitSystem): WeightUnit[] {
  return system === 'imperial' ? ['oz', 'lb'] : ['g', 'kg'];
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

export function altitudeUnit(system: UnitSystem): 'm' | 'ft' {
  return system === 'imperial' ? 'ft' : 'm';
}

/** Valor de altitud escrito en la unidad del sistema → metros. */
export function altitudeToMeters(value: number, system: UnitSystem): number {
  return system === 'imperial' ? value * METERS_PER_FOOT : value;
}

/** Metros → texto editable en la unidad del sistema. */
export function altitudeForInput(meters: number | null, system: UnitSystem): string {
  if (meters === null) return '';
  return String(Math.round(system === 'imperial' ? meters / METERS_PER_FOOT : meters));
}

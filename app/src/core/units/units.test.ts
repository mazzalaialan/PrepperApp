import { describe, expect, it } from 'vitest';
import { formatAltitude, formatDistance, formatWeight, toGrams } from './units';

describe('units', () => {
  it('formatea peso métrico', () => {
    expect(formatWeight(350, 'metric', 'es')).toBe('350 g');
    expect(formatWeight(12500, 'metric', 'es')).toBe('12,5 kg');
  });

  it('formatea peso imperial', () => {
    expect(formatWeight(100, 'imperial', 'en')).toBe('3.5 oz');
    expect(formatWeight(4535.9237, 'imperial', 'en')).toBe('10 lb');
  });

  it('convierte a gramos', () => {
    expect(toGrams(1.5, 'kg')).toBe(1500);
    expect(toGrams(1, 'lb')).toBeCloseTo(453.59, 2);
  });

  it('formatea distancias y altitudes', () => {
    expect(formatDistance(850, 'metric', 'es')).toBe('850 m');
    expect(formatDistance(2500, 'metric', 'es')).toBe('2,5 km');
    expect(formatDistance(3218.688, 'imperial', 'en')).toBe('2 mi');
    expect(formatAltitude(1000, 'imperial', 'en')).toBe('3,281 ft');
  });
});

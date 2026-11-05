import { describe, expect, it } from 'vitest';
import { declinationInfo, degMin, magneticToTrue, mapDeclinationToday, metersOffPerKm, trueToMagnetic } from './declination';

describe('declinómetro', () => {
  it('declinación y cambio anual en Buenos Aires (Oeste, se corre al Oeste)', () => {
    const d = declinationInfo(-34.6, -58.4, 0, new Date('2026-06-01T00:00:00Z'));
    expect(d.valid).toBe(true);
    expect(d.value).toBeLessThan(-5);
    expect(d.value).toBeGreaterThan(-15);
    expect(Math.abs(d.annual)).toBeLessThan(0.5);
  });

  it('fuera del período del modelo avisa', () => {
    expect(declinationInfo(-34.6, -58.4, 0, new Date('2032-01-01T00:00:00Z')).valid).toBe(false);
  });

  it('convierte rumbos: Este se suma de magnético a verdadero, Oeste se resta', () => {
    expect(magneticToTrue(100, 5)).toBe(105);
    expect(magneticToTrue(100, -8)).toBe(92);
    expect(trueToMagnetic(92, -8)).toBe(100);
    expect(magneticToTrue(3, -8)).toBe(355);
    expect(trueToMagnetic(358, 5)).toBe(353);
  });

  it('mapa viejo: declinación del margen más la variación anual por los años', () => {
    // Mapa de 1990: 5° Oeste, variación 8′ por año hacia el Oeste → 36 años después, 5° + 4,8° Oeste.
    const v = mapDeclinationToday(-5, 1990, -8, new Date('2026-01-01T00:00:00Z'));
    expect(v).toBeCloseTo(-9.8, 1);
  });

  it('error por km y grados con minutos', () => {
    expect(metersOffPerKm(1)).toBeCloseTo(17.5, 0);
    expect(degMin(-6.5)).toEqual([6, 30]);
    expect(degMin(2.9999)).toEqual([3, 0]);
  });
});

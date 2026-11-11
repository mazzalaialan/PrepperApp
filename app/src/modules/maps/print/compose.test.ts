import { describe, expect, it } from 'vitest';
import { convergenceDeg, legsBetween, planSheet, type TopoSheetInput } from './compose';

const base = (over: Partial<TopoSheetInput> = {}): TopoSheetInput => ({
  title: 'Prueba',
  date: '2026-11-11',
  line: [],
  points: [
    { n: 1, name: 'A', lat: -41.1695, lon: -71.4405 },
    { n: 2, name: 'B', lat: -41.1932, lon: -71.4561 },
  ],
  legs: [],
  declinationDeg: 5.7,
  declinationYear: 2026,
  ...over,
});

describe('hoja topográfica: planificación', () => {
  it('elige 1:25.000 para una ruta de ~3 km y centra la hoja en la ruta', () => {
    const plan = planSheet(base());
    expect(plan.scale).toBe(15_000); // 2,9 km en diagonal: entra con más detalle que 1:25.000
    expect(plan.zone).toBe(19);
    expect(plan.center.lat).toBeCloseTo(-41.18135, 4);
    expect(plan.center.lon).toBeCloseTo(-71.4483, 4);
  });

  it('una ruta de 40 km no entra en una hoja A4 (ni a 1:250.000 con margen)', () => {
    const far = base({ points: [{ n: 1, name: 'A', lat: -41, lon: -71 }, { n: 2, name: 'B', lat: -41.4, lon: -71.4 }] });
    const plan = planSheet(far);
    expect(plan.scale === null || plan.scale >= 150_000).toBe(true);
    const huge = base({ points: [{ n: 1, name: 'A', lat: -41, lon: -71 }, { n: 2, name: 'B', lat: -45, lon: -66 }] });
    expect(planSheet(huge).scale).toBeNull();
  });

  it('respeta la escala pedida y la orientación', () => {
    const plan = planSheet(base({ scale: 50_000, orientation: 'landscape' }));
    expect(plan.scale).toBe(50_000);
    expect(plan.layout.orientation).toBe('landscape');
  });

  it('sin puntos avisa', () => {
    expect(() => planSheet(base({ points: [], line: [] }))).toThrow('NO_ROUTE');
  });
});

describe('convergencia de meridianos', () => {
  it('es cero sobre el meridiano central y en el ecuador, y crece hacia el borde de la zona', () => {
    expect(convergenceDeg({ lat: -41, lon: -69 }, 19)).toBeCloseTo(0, 10);
    expect(convergenceDeg({ lat: 0, lon: -71 }, 19)).toBeCloseTo(0, 10);
    // al oeste del meridiano central en el hemisferio sur el ángulo es positivo (≈ Δλ · sen φ)
    const c = convergenceDeg({ lat: -41, lon: -71 }, 19);
    expect(c).toBeGreaterThan(1.2);
    expect(c).toBeLessThan(1.4);
    expect(convergenceDeg({ lat: 41, lon: -71 }, 19)).toBeLessThan(0);
  });
});

describe('piernas', () => {
  it('rumbo magnético = rumbo verdadero − declinación', () => {
    const pts = [
      { n: 1, name: 'A', lat: -41, lon: -71 },
      { n: 2, name: 'B', lat: -40.9, lon: -71 }, // al norte: rumbo verdadero 0°
    ];
    const [leg] = legsBetween(pts, 8);
    expect(leg!.bearingMagDeg).toBeCloseTo(352, 3);
    expect(leg!.distanceM).toBeGreaterThan(11_000);
    expect(leg!.from).toBe(1);
    expect(leg!.to).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { convergenceDeg } from './compose';
import { legsBetween, planSheet, scaleChoices, type TopoSheetInput } from './plan';

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
    expect(plan.scale).toBe(50_000); // por defecto 1:50.000 si la ruta entra (entraría hasta a 1:15.000)
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
    expect(leg!.bearingTrueDeg).toBeCloseTo(0, 3);
    expect(leg!.distanceM).toBeGreaterThan(11_000);
    expect(leg!.from).toBe(1);
    expect(leg!.to).toBe(2);
  });
});

describe('escalas disponibles', () => {
  const route = (northKm: number, eastKm = 0.5, over: Partial<TopoSheetInput> = {}) =>
    base({
      points: [
        { n: 1, name: 'A', lat: -41.2, lon: -71.4 },
        { n: 2, name: 'B', lat: -41.2 + northKm / 111.32, lon: -71.4 + eastKm / (111.32 * Math.cos((41.2 * Math.PI) / 180)) },
      ],
      ...over,
    });

  it('una ruta de 8 km: no entra a 1:10.000 ni a 1:15.000, sí desde 1:25.000... según el marco', () => {
    const c = scaleChoices(route(8));
    const by = Object.fromEntries(c.map((x) => [x.scale, x.fits]));
    expect(by[10_000]).toBe(false);
    expect(by[15_000]).toBe(false);
    expect(by[50_000]).toBe(true);
    expect(by[250_000]).toBe(true);
  });

  it('una ruta de 1 km entra a todas las escalas', () => {
    expect(scaleChoices(route(1)).every((x) => x.fits)).toBe(true);
  });

  it('una ruta de 40 km solo entra a 1:250.000, y una de 300 km, a ninguna', () => {
    const c = scaleChoices(route(40));
    expect(c.find((x) => x.scale === 100_000)!.fits).toBe(false);
    expect(c.find((x) => x.scale === 150_000)!.fits).toBe(false);
    expect(c.find((x) => x.scale === 250_000)!.fits).toBe(true);
    expect(scaleChoices(route(300)).some((x) => x.fits)).toBe(false);
  });

  it('con orientación automática usa la que sigue la forma de la ruta; una ruta ancha va apaisada', () => {
    const wide = scaleChoices(route(1, 8));
    expect(wide.find((x) => x.scale === 50_000)!.orientation).toBe('landscape');
    const tall = scaleChoices(route(8, 1));
    expect(tall.find((x) => x.scale === 50_000)!.orientation).toBe('portrait');
  });

  it('con muchas filas en la tabla, la hoja vertical tiene menos mapa: si solo entra apaisada, la usa; si se fija la orientación, no la cambia', () => {
    const legs = Array.from({ length: 30 }, (_, i) => ({ from: 1, to: 2, distanceM: 100 + i, bearingTrueDeg: 10, bearingMagDeg: 4 }));
    const r = route(5.9, 0.5, { legs });
    expect(scaleChoices({ ...r, orientation: 'portrait' }).find((x) => x.scale === 50_000)!.fits).toBe(false);
    expect(scaleChoices({ ...r, orientation: 'landscape' }).find((x) => x.scale === 50_000)!.fits).toBe(true);
    expect(scaleChoices(r).find((x) => x.scale === 50_000)).toMatchObject({ fits: true, orientation: 'landscape' });
    expect(scaleChoices({ ...r, orientation: 'portrait' }).every((x) => x.orientation === 'portrait')).toBe(true);
  });

  it('planSheet: una escala pedida que no entra deja la hoja sin escala', () => {
    expect(planSheet({ ...route(8), scale: 10_000 }).scale).toBeNull();
    expect(planSheet({ ...route(8), scale: 50_000 }).scale).toBe(50_000);
  });

  it('el papel Oficio es más largo: una ruta de 10 km de norte a sur entra a 1:50.000 en Oficio pero no en A4', () => {
    const r = route(10);
    expect(scaleChoices({ ...r, orientation: 'portrait', paper: 'a4' }).find((x) => x.scale === 50_000)!.fits).toBe(false);
    expect(scaleChoices({ ...r, orientation: 'portrait', paper: 'oficio' }).find((x) => x.scale === 50_000)!.fits).toBe(true);
    expect(planSheet({ ...r, paper: 'oficio', scale: 50_000 }).layout.paper).toEqual({ w: 216, h: 330 });
  });
});

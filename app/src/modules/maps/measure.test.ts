import { describe, expect, it } from 'vitest';
import { climb, elevationAt, pathDistance, summarizePath, targetInfo, type HeightLoader } from './measure';

const SIZE = 256;
/** Terreno de prueba: sube 1 m por cada píxel hacia el este (coordenada global x a zoom 12). */
const ramp: HeightLoader = async (tx) => {
  const t = new Float32Array(SIZE * SIZE);
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) t[r * SIZE + c] = tx * SIZE + c;
  return t;
};
const flat = (h: number): HeightLoader => async () => new Float32Array(SIZE * SIZE).fill(h);
const missing: HeightLoader = async () => null;

describe('herramientas del mapa', () => {
  it('altura en un punto (bilineal) y sin datos', async () => {
    const a = await elevationAt({ lat: -41.15, lon: -71.88 }, ramp);
    const b = await elevationAt({ lat: -41.15, lon: -71.87 }, ramp);
    expect(b! - a!).toBeGreaterThan(0);
    expect(await elevationAt({ lat: -41.15, lon: -71.88 }, flat(3478))).toBeCloseTo(3478, 3);
    expect(await elevationAt({ lat: -41.15, lon: -71.88 }, missing)).toBeNull();
  });

  it('desnivel con umbral: el ruido no suma', () => {
    expect(climb([100, 102, 101, 103, 100, 102])).toEqual({ ascent: 0, descent: 0 });
    expect(climb([100, 150, 120, 200])).toEqual({ ascent: 130, descent: 30 });
  });

  it('recorrido: distancia por tramos, desnivel, mínimo y máximo', async () => {
    const pts = [
      { lat: -41.15, lon: -71.9 },
      { lat: -41.15, lon: -71.85 },
      { lat: -41.15, lon: -71.88 },
    ];
    const s = await summarizePath(pts, ramp);
    expect(s.legs).toHaveLength(2);
    expect(s.distance).toBeCloseTo(pathDistance(pts), 6);
    expect(s.distance).toBeGreaterThan(6500);
    expect(s.ascent!).toBeGreaterThan(100);
    expect(s.descent!).toBeGreaterThan(50);
    expect(s.max!).toBeGreaterThan(s.min!);
    expect(s.profile.at(-1)![0]).toBeCloseTo(s.distance, 0);
    // Sin elevación: solo la distancia.
    const n = await summarizePath(pts, missing);
    expect(n.distance).toBeCloseTo(s.distance, 6);
    expect(n.ascent).toBeNull();
  });

  it('dirección a un punto: rumbo, distancia y ángulo para mirarlo', async () => {
    // Desde Pampa Linda hacia la cima del Tronador (al ONO, unos 14 km).
    const from = { lat: -41.2307, lon: -71.7451 };
    const cima = { lat: -41.1575, lon: -71.8833 };
    const r = await targetInfo(from, cima, async (tx) => (tx > 0 ? new Float32Array(SIZE * SIZE).fill(1000) : null));
    expect(r.distance).toBeGreaterThan(13_000);
    expect(r.distance).toBeLessThan(14_500);
    expect(r.bearing).toBeGreaterThan(290);
    expect(r.bearing).toBeLessThan(310);
    expect(r.elevationAngle).toBeCloseTo(0, 5);
    const noDem = await targetInfo({ ...from, alt: 900 }, cima, missing);
    expect(noDem.targetAlt).toBeNull();
    expect(noDem.originAlt).toBe(900);
    expect(noDem.elevationAngle).toBeNull();
  });
});

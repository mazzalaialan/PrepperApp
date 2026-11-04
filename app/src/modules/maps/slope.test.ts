import { describe, expect, it } from 'vitest';
import { metersPerPixel, paintSlope, slopeDegrees, terrarium } from './slope';

/** Plano que sube hacia el este con una pendiente dada (grados), en una tesela de `size`. */
function plane(deg: number, z: number, y: number, size: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    const m = metersPerPixel(z, y, py, size);
    for (let px = 0; px < size; px++) out[py * size + px] = 1000 + px * m * Math.tan((deg * Math.PI) / 180);
  }
  return out;
}

describe('pendiente para la capa de avalanchas', () => {
  // Tesela de zoom 12 sobre el Cerro Catedral (Bariloche).
  const z = 12;
  const y = 2561;

  it('decodifica la altura Terrarium', () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(132, 76, 128)).toBeCloseTo(1100.5, 5);
  });

  it('a −41° un píxel de zoom 12 mide unos 29 m', () => {
    expect(metersPerPixel(z, y, 128)).toBeGreaterThan(27);
    expect(metersPerPixel(z, y, 128)).toBeLessThan(31);
  });

  it('mide bien la pendiente de un plano', () => {
    for (const deg of [10, 27, 38, 50]) {
      const s = slopeDegrees(plane(deg, z, y, 32), z, y, 32);
      // Lejos de los bordes (que se repiten).
      expect(s[16 * 32 + 16]!).toBeCloseTo(deg, 0);
    }
  });

  it('pinta con los colores del inclinómetro, también el verde de riesgo bajo', () => {
    const colors = { low: '#6f9e4c', caution: '#d0a03c', avalanche: '#b84a30', steep: '#e8231b' };
    const px = paintSlope(new Float32Array([10, 27, 38, 50]), colors, 190);
    expect([...px.slice(0, 4)]).toEqual([0x6f, 0x9e, 0x4c, 190]);
    expect([...px.slice(4, 8)]).toEqual([0xd0, 0xa0, 0x3c, 190]);
    expect([...px.slice(8, 12)]).toEqual([0xb8, 0x4a, 0x30, 190]);
    expect([...px.slice(12, 16)]).toEqual([0xe8, 0x23, 0x1b, 190]);
  });
});

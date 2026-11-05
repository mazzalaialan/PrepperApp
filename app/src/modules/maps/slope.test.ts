import { describe, expect, it } from 'vitest';
import { metersPerPixel, overzoomElevation, paintSlope, slopeDegrees, SLOPE_TILE, terrarium, upsampleElevation } from './slope';

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
    const colors = { low: '#6f9e4c', caution: '#d0a03c', avalanche: '#b84a30', steep: '#f07c1a', extreme: '#8c939b' };
    const px = paintSlope(new Float32Array([10, 27, 38, 50, 60]), colors, { alpha: 190 });
    expect([...px.slice(0, 4)]).toEqual([0x6f, 0x9e, 0x4c, 190]);
    expect([...px.slice(4, 8)]).toEqual([0xd0, 0xa0, 0x3c, 190]);
    expect([...px.slice(8, 12)]).toEqual([0xb8, 0x4a, 0x30, 190]);
    // 45° a 55°: naranja; más de 55°: gris.
    expect([...px.slice(12, 16)]).toEqual([0xf0, 0x7c, 0x1a, 190]);
    expect([...px.slice(16, 20)]).toEqual([0x8c, 0x93, 0x9b, 190]);
  });

  it('mide hacia dónde mira la ladera', () => {
    // El plano sube hacia el este: mira al oeste.
    const size = 32;
    const aspect = new Float32Array(size * size);
    slopeDegrees(plane(30, z, y, size), z, y, size, aspect);
    expect(aspect[16 * size + 16]!).toBeCloseTo(270, 0);
    // Volteado (sube hacia el oeste): mira al este.
    const east = plane(30, z, y, size);
    const flipped = east.map((_, i) => east[Math.floor(i / size) * size + (size - 1 - (i % size))]!);
    const a2 = new Float32Array(size * size);
    slopeDegrees(flipped, z, y, size, a2);
    expect(Math.abs(a2[16 * size + 16]! - 90)).toBeLessThan(5);
  });

  it('raya solo las laderas empinadas de sotavento', () => {
    const colors = { low: '#6f9e4c', caution: '#d0a03c', avalanche: '#b84a30', steep: '#f07c1a', extreme: '#8c939b', hatch: '#000000' };
    const size = 12;
    const slope = new Float32Array(size * size).fill(38);
    const facingEast = new Float32Array(size * size).fill(90);
    const painted = paintSlope(slope, colors, { aspect: facingEast, lee: [90], size });
    const black = (p: number) => painted[p * 4] === 0 && painted[p * 4 + 3] === 255;
    const stripes = Array.from({ length: size * size }, (_, p) => black(p)).filter(Boolean).length;
    // Dos de cada seis diagonales.
    expect(stripes / (size * size)).toBeCloseTo(2 / 6, 1);
    // A barlovento o sin sotavento: sin rayas.
    const facingWest = new Float32Array(size * size).fill(270);
    const windward = paintSlope(slope, colors, { aspect: facingWest, lee: [90], size });
    expect(windward.some((v, i) => i % 4 === 3 && v === 255)).toBe(false);
    // Pendiente baja: sin rayas.
    const flat = paintSlope(new Float32Array(size * size).fill(15), colors, { aspect: facingEast, lee: [90], size });
    expect(flat.some((v, i) => i % 4 === 3 && v === 255)).toBe(false);
  });

  it('el habitual va en la otra diagonal y en otro color', () => {
    const colors = { low: '#6f9e4c', caution: '#d0a03c', avalanche: '#b84a30', steep: '#f07c1a', extreme: '#8c939b', hatch: '#000000', hatchUsual: '#0000ff' };
    const size = 12;
    const slope = new Float32Array(size * size).fill(38);
    const east = new Float32Array(size * size).fill(90);
    const px = paintSlope(slope, colors, { aspect: east, lee: [90], leeUsual: [90], size });
    const at = (x: number, y: number) => [...px.slice((y * size + x) * 4, (y * size + x) * 4 + 3)];
    // (0,0): las dos diagonales; gana la reciente.
    expect(at(0, 0)).toEqual([0, 0, 0]);
    expect(at(3, 2)).toEqual([0, 0, 255]); // 3 − 2 = 1 (< 2): habitual; 3 + 2 = 5: no reciente
    expect(at(2, 2)).toEqual([0, 0, 255]); // 2 − 2 = 0: habitual; 2 + 2 = 4: no reciente
    // Solo el habitual: sin rayas negras.
    const onlyUsual = paintSlope(slope, colors, { aspect: east, leeUsual: [90], size });
    expect(Array.from({ length: size * size }, (_, p) => onlyUsual[p * 4 + 2] === 255).filter(Boolean).length).toBeGreaterThan(0);
    expect(Array.from({ length: size * size }, (_, p) => onlyUsual[p * 4 + 3] === 255 && onlyUsual[p * 4 + 2] === 0).filter(Boolean).length).toBe(0);
  });
});

describe('pendiente con zoom mayor que el de la elevación', () => {
  // Elevación de zoom 12 sobre Bariloche; la tesela de pendiente se pide en zoom 15.
  const demZoom = 12;
  const z = 15;
  const deg = 35;
  const ty = 2561;
  // Plano que sube hacia el este, en píxeles globales de zoom 12 (misma latitud, metros por píxel casi iguales).
  const m12 = metersPerPixel(demZoom, ty, 128);
  const rise = m12 * Math.tan((deg * Math.PI) / 180);
  const planeTile = (tx: number, tyy: number) => {
    const t = new Float32Array(SLOPE_TILE * SLOPE_TILE);
    for (let py = 0; py < SLOPE_TILE; py++) for (let px = 0; px < SLOPE_TILE; px++) t[py * SLOPE_TILE + px] = 1000 + (tx * SLOPE_TILE + px) * rise + (tyy - ty) * 0;
    return t;
  };

  it('la interpolación respeta un plano: sin escalones', () => {
    const up = upsampleElevation((gx) => gx * 2, 10, 10, 8, 16, 1);
    const n = 18;
    const steps = new Set<string>();
    for (let px = 1; px < n; px++) steps.add((up[5 * n + px]! - up[5 * n + px - 1]!).toFixed(6));
    expect([...steps]).toEqual(['0.250000']);
  });

  it('mide la pendiente a la escala del zoom pedido', async () => {
    const x = 1234 * 8 + 3;
    const y = ty * 8 + 4;
    const elev = await overzoomElevation(z, x, y, demZoom, async (tx, tyy) => planeTile(tx, tyy), 1);
    expect(elev).not.toBeNull();
    const s = slopeDegrees(elev!, z, y, SLOPE_TILE, undefined, 1);
    for (const p of [0, 128 * SLOPE_TILE + 128, SLOPE_TILE * SLOPE_TILE - 1]) expect(s[p]!).toBeCloseTo(deg, 0);
  });

  it('en el borde de la tesela de elevación usa la vecina: no queda costura', async () => {
    // La última tesela de zoom 15 dentro de la de zoom 12: su borde derecho es el borde de la tesela de elevación.
    const x = 1234 * 8 + 7;
    const y = ty * 8 + 2;
    const asked: string[] = [];
    const elev = await overzoomElevation(z, x, y, demZoom, async (tx, tyy) => (asked.push(`${tx},${tyy}`), planeTile(tx, tyy)), 1);
    expect(asked).toContain('1235,2561');
    const s = slopeDegrees(elev!, z, y, SLOPE_TILE, undefined, 1);
    expect(s[100 * SLOPE_TILE + SLOPE_TILE - 1]!).toBeCloseTo(deg, 0);
  });

  it('sin la tesela que la contiene no hay pendiente', async () => {
    expect(await overzoomElevation(z, 1234 * 8, ty * 8, demZoom, async () => null)).toBeNull();
  });
});

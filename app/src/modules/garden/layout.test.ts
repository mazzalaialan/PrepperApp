import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { GardenBed } from '@/core/model/types';
import { cellDepth, planLayout, shadedBy, sunDirection } from './layout';

const BA = { lat: -34.6, lon: -58.4 };
const bed = (f: Partial<GardenBed> = {}) =>
  newEntity<GardenBed>({ name: 'b', kind: 'bed', greenhouse: false, widthCm: 120, lengthCm: 240, sunHours: 8, waypointId: null, notes: '', order: 0, bearingDeg: 0, ...f });

describe('dirección del sol', () => {
  it('en Buenos Aires el sol viene del norte', () => {
    const d = sunDirection(bed(), BA, new Date(2026, 5, 21, 12));
    expect(d.fromDeg === 0 || d.fromDeg > 340 || d.fromDeg < 20).toBe(true);
    expect(d.noonAltitude).toBeGreaterThan(25);
  });
});

describe('distribución', () => {
  const b = bed(); // 4 columnas × 8 filas, el frente (arriba) mira al norte
  const free = Array.from({ length: 32 }, (_, i) => i);
  const sun = { fromDeg: 0, noonAltitude: 55 };

  it('la sombra cae al sur: el sur (abajo) es lo más profundo', () => {
    expect(cellDepth(b, 28, 180)).toBeGreaterThan(cellDepth(b, 0, 180));
  });
  it('los altos van al sur y los bajos al norte', () => {
    const r = planLayout(b, free, [{ cropId: 'lechuga', cells: 16 }, { cropId: 'tomate', cells: 16 }], sun);
    expect(r.order[0]).toBe('tomate');
    expect(r.assignment.get(31)).toBe('tomate');
    expect(r.assignment.get(0)).toBe('lechuga');
    expect(r.shadowCm.get('tomate')).toBeGreaterThan(100);
  });
  it('con el frente al sur, lo alto queda arriba de la grilla', () => {
    const r = planLayout(bed({ bearingDeg: 180 }), free, [{ cropId: 'lechuga', cells: 16 }, { cropId: 'tomate', cells: 16 }], sun);
    expect(r.assignment.get(0)).toBe('tomate');
  });
  it('avisa el tomate que le tapa la lechuga puesta al sur', () => {
    const owners = new Map<number, string>([[0, 'tomate'], [4, 'zanahoria']]);
    expect(shadedBy(b, owners, sun)).toEqual([{ shaded: 'zanahoria', by: 'tomate' }]);
    const ok = new Map<number, string>([[4, 'tomate'], [0, 'zanahoria']]);
    expect(shadedBy(b, ok, sun)).toEqual([]);
  });
});

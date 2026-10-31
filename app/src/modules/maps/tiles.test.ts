import { describe, expect, it } from 'vitest';
import { circleBounds, countTiles, eachTile, MAX_VECTOR_TILES, planZone, tileRanges } from './tiles';

describe('zonas offline', () => {
  it('el círculo entra en el rectángulo (más ancho en grados lejos del ecuador)', () => {
    const b = circleBounds(-41.13, -71.31, 10);
    expect(b.north - b.south).toBeCloseTo((2 * 10) / 111.32, 4);
    expect(b.east - b.west).toBeGreaterThan(b.north - b.south);
  });

  it('zoom 0: una sola tesela para todo el mundo; las cuentas coinciden con lo que se recorre', () => {
    const ranges = tileRanges(circleBounds(-34.6, -58.4, 5), 0, 14);
    expect(countTiles(ranges.slice(0, 1))).toBe(1);
    expect([...eachTile(ranges)]).toHaveLength(countTiles(ranges));
  });

  it('5 km con todo el detalle está dentro del límite de OpenFreeMap; 50 km no', () => {
    const small = planZone(-41.13, -71.31, 5, 14);
    expect(small.withinLimits).toBe(true);
    expect(small.vectorTiles).toBeLessThan(200);
    // La elevación llega hasta el zoom 12 aunque el mapa llegue al 14.
    expect(Math.max(...small.dem.map((r) => r.z))).toBe(12);
    const big = planZone(-41.13, -71.31, 50, 14);
    expect(big.vectorTiles).toBeGreaterThan(MAX_VECTOR_TILES);
    expect(big.withinLimits).toBe(false);
    expect(planZone(-41.13, -71.31, 50, 12).withinLimits).toBe(true);
  });
});

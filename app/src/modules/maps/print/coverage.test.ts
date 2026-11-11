import { describe, expect, it } from 'vitest';
import { paperMm } from './geometry';
import { sheetBounds, tileZooms } from './coverage';

describe('cobertura del mapa para la hoja', () => {
  it('el rectángulo cubre el marco: 190 mm a 1:50.000 son 9,5 km (más el margen)', () => {
    const b = sheetBounds({ lat: -41, lon: -71 }, 50_000, { w: 190, h: 180 });
    const widthKm = ((b.east - b.west) * 111.32 * Math.cos((41 * Math.PI) / 180));
    expect(widthKm).toBeGreaterThan(9.5);
    expect(widthKm).toBeLessThan(10.5);
    expect((b.north - b.south) * 111.32).toBeCloseTo(9 * 1.06, 1);
    expect(paperMm(9500, 50_000)).toBe(190);
    // centrado
    expect((b.east + b.west) / 2).toBeCloseTo(-71, 9);
    expect((b.north + b.south) / 2).toBeCloseTo(-41, 9);
  });

  it('zooms de las teselas: el mapa llega al 14 y el relieve al 12', () => {
    expect(tileZooms(13.12)).toEqual({ vector: 13, dem: 12 });
    expect(tileZooms(15.4)).toEqual({ vector: 14, dem: 12 });
    expect(tileZooms(10.3)).toEqual({ vector: 10, dem: 11 });
  });
});

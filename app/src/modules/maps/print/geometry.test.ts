import { describe, expect, it } from 'vitest';
import { PAPERS, contourInterval, coordRows, edgeTicks, groundMeters, gridLabel, gridLines, gridStepM, latLonStepDeg, paperMm, pickScale, scaleBar, scaleEquivalence, sheetLayout, zoomForScale } from './geometry';

describe('geometría de la hoja topográfica', () => {
  it('la cuadrícula mide en el papel lo que dice la escala', () => {
    // 1:25.000 con cuadrícula de 1 km = 40 mm; 1:50.000 = 20 mm; 1:100.000 con 2 km = 20 mm
    expect(paperMm(gridStepM(25_000), 25_000)).toBeCloseTo(40, 6);
    expect(paperMm(gridStepM(50_000), 50_000)).toBeCloseTo(20, 6);
    expect(paperMm(gridStepM(100_000), 100_000)).toBeCloseTo(20, 6);
    expect(gridLabel(25_000)).toBe('1 km × 1 km');
    expect(gridLabel(10_000)).toBe('500 m × 500 m');
    expect(gridLabel(100_000)).toBe('2 km × 2 km');
  });

  it('equivalencias', () => {
    expect(scaleEquivalence(25_000)).toBe('1 cm = 250 m');
    expect(scaleEquivalence(50_000)).toBe('1 cm = 500 m');
    expect(scaleEquivalence(100_000)).toBe('1 cm = 1 km');
    expect(groundMeters(40, 25_000)).toBe(1000);
  });

  it('barra de escala redonda y de largo razonable', () => {
    for (const s of [10_000, 25_000, 50_000, 100_000]) {
      const b = scaleBar(s);
      expect(b.mm).toBeGreaterThan(25);
      expect(b.mm).toBeLessThan(110);
      expect(String(b.meters)).toMatch(/^[125]0*$/);
    }
    expect(scaleBar(25_000)).toEqual({ meters: 1000, mm: 40 });
  });

  it('marcas de latitud y longitud con al menos 30 mm entre sí', () => {
    for (const s of [10_000, 25_000, 50_000, 100_000]) {
      const step = latLonStepDeg(s);
      const mm = paperMm(step * 111_320, s);
      expect(mm).toBeGreaterThanOrEqual(30);
      expect(mm).toBeLessThan(150);
    }
  });

  it('zoom: un píxel a 300 ppp a 1:25.000 mide 2,1167 m', () => {
    // a la latitud 0 y con pixelRatio 1, 2,1167 m por píxel de pantalla
    const z = zoomForScale(0, 25_000, 300, 1);
    const metersPerPx = 40_075_016.686 / (512 * 2 ** z);
    expect(metersPerPx).toBeCloseTo((25_000 * 0.0254) / 300, 6);
    // con pixelRatio 3,125 cada píxel de pantalla cubre 3,125 píxeles de papel: el zoom baja log2(3,125)
    expect(zoomForScale(0, 25_000, 300, 3.125) - z).toBeCloseTo(-Math.log2(3.125), 6);
    // más al sur, el mismo píxel cubre menos metros: hace falta un zoom menor
    expect(zoomForScale(-41, 25_000)).toBeLessThan(zoomForScale(0, 25_000));
  });

  it('líneas de la cuadrícula dentro del rectángulo', () => {
    const g = gridLines(295_400, 300_200, 5_448_300, 5_452_900, 1000);
    expect(g.eastings).toEqual([296_000, 297_000, 298_000, 299_000, 300_000]);
    expect(g.northings).toEqual([5_449_000, 5_450_000, 5_451_000, 5_452_000]);
  });

  it('diseño vertical: mapa, tabla, pie y título sin pisarse y dentro de la hoja', () => {
    const l = sheetLayout('portrait', 8);
    expect(l.paper).toEqual({ w: 210, h: 297 });
    expect(l.map.y).toBeGreaterThanOrEqual(l.header.y + l.header.h);
    expect(l.table.y).toBeGreaterThanOrEqual(l.map.y + l.map.h);
    expect(l.footer.y).toBeGreaterThanOrEqual(l.table.y + l.table.h);
    expect(l.footer.y + l.footer.h).toBeLessThanOrEqual(297 - l.margin + 1e-9);
    expect(l.map.h).toBeGreaterThan(120);
    // más filas, tabla más alta y mapa más bajo
    expect(sheetLayout('portrait', 20).map.h).toBeLessThan(l.map.h);
  });

  it('diseño horizontal: la tabla va a la derecha', () => {
    const l = sheetLayout('landscape', 8);
    expect(l.paper).toEqual({ w: 297, h: 210 });
    expect(l.table.x).toBeGreaterThanOrEqual(l.map.x + l.map.w);
    expect(l.table.x + l.table.w).toBeLessThanOrEqual(297 - l.margin + 1e-9);
  });

  it('elige la escala de más detalle a la que entra la zona', () => {
    const frame = { w: 190, h: 170 };
    expect(pickScale(1000, 800, frame)).toBe(10_000); // 100 mm × 80 mm (+ margen) entra a 1:10.000
    expect(pickScale(2000, 1500, frame)).toBe(15_000); // a 1:10.000 serían 200 mm: no entra
    expect(pickScale(8000, 6000, frame)).toBe(50_000); // a 1:25.000 son 320 mm: no entra
    expect(pickScale(2_000_000, 2_000_000, frame)).toBeNull();
  });

  it('equidistancia de las curvas según el zoom', () => {
    expect(contourInterval(13.1)).toEqual({ minor: 20, major: 100 });
    expect(contourInterval(14.7)).toEqual({ minor: 10, major: 50 });
    expect(contourInterval(11.9)).toEqual({ minor: 100, major: 500 });
    expect(contourInterval(5)).toEqual({ minor: 500, major: 1000 });
  });

  it('marcas en un borde: dónde el valor pasa por múltiplos del paso (también con el valor decreciente)', () => {
    const up = edgeTicks([{ pos: 0, value: 10.1 }, { pos: 100, value: 10.9 }], 0.25);
    expect(up.map((t) => t.value)).toEqual([10.25, 10.5, 10.75]);
    expect(up[0]!.pos).toBeCloseTo(18.75, 6);
    const down = edgeTicks([{ pos: 0, value: -41.0 }, { pos: 100, value: -41.4 }], 0.25);
    expect(down.map((t) => t.value)).toEqual([-41.25, -41]);
    expect(down.every((t) => t.pos >= 0 && t.pos <= 100)).toBe(true);
  });

  it('papel Oficio (Argentina): 216 × 330 mm, con más mapa que el A4 y todo dentro de la hoja', () => {
    expect(PAPERS.oficio).toMatchObject({ w: 216, h: 330 });
    const a4 = sheetLayout('portrait', 8);
    const of = sheetLayout('portrait', 8, 'oficio');
    expect(of.paper).toEqual({ w: 216, h: 330 });
    expect(of.map.h).toBeGreaterThan(a4.map.h + 25);
    expect(of.footer.y + of.footer.h).toBeLessThanOrEqual(330 - of.margin + 1e-9);
    expect(sheetLayout('landscape', 8, 'oficio').paper).toEqual({ w: 330, h: 216 });
  });

  it('lista de coordenadas: se reserva lugar sin pisar el mapa, la tabla ni el pie', () => {
    expect(sheetLayout('portrait', 4).coords).toBeNull();
    for (const o of ['portrait', 'landscape'] as const) {
      const l = sheetLayout(o, 4, 'a4', 8);
      expect(l.coords).not.toBeNull();
      const c = l.coords!;
      expect(c.y + c.h).toBeLessThanOrEqual(l.footer.y + 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(l.table.y + l.table.h);
      expect(l.map.h).toBeGreaterThan(80);
    }
    expect(sheetLayout('portrait', 4, 'a4', 8).map.h).toBeLessThan(sheetLayout('portrait', 4).map.h);
    expect(coordRows(8, 'portrait')).toBe(4);
    expect(coordRows(8, 'landscape')).toBe(8);
    expect(coordRows(40, 'portrait')).toBe(6); // tope de 12 puntos en dos columnas
  });
});

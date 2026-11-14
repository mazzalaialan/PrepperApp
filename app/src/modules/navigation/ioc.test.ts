import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iocNear, measuredSeries, type IocCatalog, type IocLevels } from './ioc';
import { tideLevelAt, type TidesData } from './tides';

const catalog = JSON.parse(readFileSync(new URL('../../../public/data/ioc-stations.json', import.meta.url), 'utf8')) as IocCatalog;
const tides = JSON.parse(readFileSync(new URL('../../../public/data/tides.json', import.meta.url), 'utf8')) as TidesData;
const arica = tides.stations.find((s) => s.name.startsWith('Arica'))!;

describe('mareógrafos medidos del IOC', () => {
  it('el catálogo trae estaciones de Chile, Perú y Argentina con código, nombre y coordenadas', () => {
    expect(catalog.stations.length).toBeGreaterThan(50);
    expect(new Set(catalog.stations.map((s) => s.country))).toContain('CHL');
    for (const s of catalog.stations) {
      expect(s.code).toMatch(/^[A-Za-z0-9]{4,5}$/);
      expect(Number.isFinite(s.lat) && Number.isFinite(s.lon)).toBe(true);
    }
    expect(new Set(catalog.stations.map((s) => s.code)).size).toBe(catalog.stations.length);
  });

  it('encuentra el mareógrafo de una estación de mareas y nada si está lejos', () => {
    const near = iocNear(catalog.stations, arica.lat, arica.lon);
    expect(near?.station.country).toBe('CHL');
    expect(near!.km).toBeLessThan(30);
    expect(iocNear(catalog.stations, -34.9, -56.2)).toBeNull(); // Montevideo
  });

  it('una medición igual a la marea calculada con otro cero no se separa de ella', () => {
    const t0 = Date.parse('2026-11-13T12:00:00Z');
    const points: [number, number][] = Array.from({ length: 150 }, (_, i) => {
      const ms = t0 + i * 600_000;
      return [ms, tideLevelAt(arica, new Date(ms)) + 5.4];
    });
    const m = measuredSeries({ code: 'x', sensor: 'rad', fetchedAt: 0, points }, arica)!;
    expect(Math.abs(m.deviation)).toBeLessThan(0.001);
    expect(m.rms).toBeLessThan(0.001);
    expect(m.lastAt.getTime()).toBe(points[149]![0]);
  });

  it('si el agua sube sobre lo calculado en las últimas horas, la desviación es positiva', () => {
    const t0 = Date.parse('2026-11-13T12:00:00Z');
    const points: [number, number][] = Array.from({ length: 150 }, (_, i) => {
      const ms = t0 + i * 600_000;
      return [ms, tideLevelAt(arica, new Date(ms)) + (i >= 120 ? 0.3 : 0)];
    });
    const m = measuredSeries({ code: 'x', sensor: 'rad', fetchedAt: 0, points } as IocLevels, arica)!;
    // El desfase promedio absorbe parte del salto (30 de 150 puntos): la desviación final es 0.3 − 0.3·30/150 = 0.24.
    expect(m.deviation).toBeGreaterThan(0.2);
    expect(m.deviation).toBeLessThan(0.3);
  });

  it('con muy pocos puntos no se calcula', () => {
    expect(measuredSeries({ code: 'x', sensor: 'rad', fetchedAt: 0, points: [[0, 1]] }, arica)).toBeNull();
  });
});

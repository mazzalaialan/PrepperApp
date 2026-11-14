import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nearestStations, NEAR_KM, tideCurve, tideExtremes, tideLevelAt, type TidesData } from './tides';

const data = JSON.parse(readFileSync(new URL('../../../public/data/tides.json', import.meta.url), 'utf8')) as TidesData;
const byName = (name: string) => data.stations.find((s) => s.name === name)!;

describe('mareas sin conexión', () => {
  it('el archivo trae estaciones de Argentina, Chile y Perú con sus constantes y la fuente', () => {
    expect(data.stations.length).toBeGreaterThanOrEqual(20);
    expect(new Set(data.stations.map((s) => s.country))).toEqual(new Set(['AR', 'CL', 'PE']));
    expect(data.source).toContain('CC BY 4.0');
    for (const s of data.stations) {
      expect(s.constituents.length).toBeGreaterThanOrEqual(8);
      expect(s.constituents.some(([n]) => n === 'M2')).toBe(true);
      expect(Number.isFinite(s.lat) && Number.isFinite(s.lon)).toBe(true);
    }
  });

  it('la estación más cercana de un punto', () => {
    // Puerto Madryn, Valparaíso y El Callao.
    expect(nearestStations(data.stations, -42.77, -65.04)[0]!.station.name).toBe('Puerto Madryn');
    expect(nearestStations(data.stations, -33.0, -71.6)[0]!.station.name).toBe('Valparaiso');
    expect(nearestStations(data.stations, -12.06, -77.15)[0]!.station.name).toBe('Callao');
    expect(nearestStations(data.stations, -42.77, -65.04, 3)).toHaveLength(3);
  });

  it('Montevideo (Uruguay no tiene estación): la más cercana está más lejos que el límite de «cercana»', () => {
    const [near] = nearestStations(data.stations, -34.9, -56.2);
    expect(near!.station.name).toBe('Buenos Aires');
    expect(near!.km).toBeGreaterThan(100);
    expect(NEAR_KM).toBe(100);
  });

  it('las pleamares y bajamares se alternan, con la amplitud propia de cada costa', () => {
    const start = new Date('2026-11-14T00:00:00Z');
    const end = new Date('2026-11-17T00:00:00Z');
    const range = (name: string) => {
      const ex = tideExtremes(byName(name), start, end);
      expect(ex.length).toBeGreaterThanOrEqual(8);
      for (let i = 1; i < ex.length; i++) expect(ex[i]!.high).toBe(!ex[i - 1]!.high);
      return Math.max(...ex.map((e) => e.level)) - Math.min(...ex.map((e) => e.level));
    };
    // Golfo Nuevo (macromareal) contra el Callao (micromareal): la diferencia es enorme.
    expect(range('Puerto Madryn')).toBeGreaterThan(2.5);
    expect(range('Callao')).toBeLessThan(1.2);
  });

  it('el gráfico trae un punto cada 20 minutos y la altura en un instante coincide con la curva', () => {
    const s = byName('Valparaiso');
    const start = new Date('2026-11-14T00:00:00Z');
    const curve = tideCurve(s, start, new Date(start.getTime() + 24 * 3600_000), 20);
    expect(curve.length).toBeGreaterThanOrEqual(72);
    expect(tideLevelAt(s, curve[10]!.time)).toBeCloseTo(curve[10]!.level, 2);
  });
});

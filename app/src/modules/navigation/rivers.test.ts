import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nearestRivers, readingsFrom, riverState, type RiversData } from './rivers';

const data = JSON.parse(readFileSync(new URL('../../../public/data/rivers-AR.json', import.meta.url), 'utf8')) as RiversData;

describe('niveles de los ríos de Argentina', () => {
  it('el catálogo trae estaciones con umbrales y la serie del INA', () => {
    expect(data.stations.length).toBeGreaterThanOrEqual(60);
    for (const s of data.stations) {
      expect(Number.isFinite(s.lat) && Number.isFinite(s.lon) && Number.isFinite(s.series)).toBe(true);
      expect([s.alert, s.evac, s.low].some((v) => v !== null)).toBe(true);
    }
    expect(data.source).toContain('INA');
  });

  it('el estado según los umbrales de la estación', () => {
    const s = { alert: 3.3, evac: 3.9, low: 0.21 };
    expect(riverState(3.95, s)).toBe('evac');
    expect(riverState(3.9, s)).toBe('evac');
    expect(riverState(3.5, s)).toBe('alert');
    expect(riverState(1.2, s)).toBe('normal');
    expect(riverState(0.21, s)).toBe('low');
    expect(riverState(0.1, s)).toBe('low');
    // Sin umbral de evacuación ni de aguas bajas.
    expect(riverState(9, { alert: 5, evac: null, low: null })).toBe('alert');
    expect(riverState(0, { alert: null, evac: null, low: null })).toBe('normal');
  });

  it('las estaciones más cercanas, hasta una distancia máxima', () => {
    // Buenos Aires: la de Buenos Aires está primera.
    const near = nearestRivers(data.stations, -34.56, -58.4);
    expect(near[0]!.station.name).toBe('Buenos Aires');
    expect(near).toHaveLength(5);
    expect(near[0]!.km).toBeLessThan(2);
    // Perú: ninguna a menos de 250 km.
    expect(nearestRivers(data.stations, -12, -77)).toEqual([]);
  });

  it('el último nivel de cada serie y su cambio respecto de hace un día', () => {
    const obs = [
      { series_id: 85, timestart: '2026-11-12T03:00:00.000Z', valor: 3.0 },
      { series_id: 85, timestart: '2026-11-13T03:00:00.000Z', valor: 3.5 },
      { series_id: 85, timestart: '2026-11-13T09:00:00.000Z', valor: null },
      { series_id: 14, timestart: '2026-11-13T03:00:00.000Z', valor: 10.1 },
    ];
    const r = readingsFrom(obs);
    expect(r.get(85)!.level).toBe(3.5);
    expect(r.get(85)!.change).toBeCloseTo(0.5, 5);
    expect(r.get(85)!.at).toBe('2026-11-13T03:00:00.000Z');
    // Una sola lectura: sin cambio.
    expect(r.get(14)).toMatchObject({ level: 10.1, change: null });
  });
});

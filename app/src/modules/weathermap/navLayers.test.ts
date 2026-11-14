import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BoCatalog, BoLevels } from '@/modules/navigation/bolivia';
import type { RiverReading, RiversData } from '@/modules/navigation/rivers';
import type { TidesData } from '@/modules/navigation/tides';
import type { GeoData } from './geo';
import { boPoints, inaPoints, tidePoints } from './navLayers';

const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(`../../../public/data/${f}`, import.meta.url), 'utf8')) as T;
const ina = read<RiversData>('rivers-AR.json');
const bo = read<BoCatalog>('rivers-BO.json');
const tides = read<TidesData>('tides.json');
const geo = JSON.parse(readFileSync(new URL('./geo-data.json', import.meta.url), 'utf8')) as GeoData;

describe('capas de Navegación del mapa', () => {
  it('cada estación del INA es un punto, con su estado según los umbrales y «sin dato» si no hay lectura', () => {
    const withAlert = ina.stations.find((s) => s.alert !== null)!;
    const readings = new Map<number, RiverReading>([[withAlert.series, { level: withAlert.alert! + 0.1, at: '2026-11-14T12:00:00Z', change: 0 } as RiverReading]]);
    const points = inaPoints(ina.stations, readings);
    expect(points).toHaveLength(ina.stations.length);
    expect(points.find((p) => p.id === `ina-${withAlert.id}`)!.state).toMatch(/alert|evac/);
    expect(points.filter((p) => p.state === 'unknown')).toHaveLength(ina.stations.length - 1);
  });

  it('en Bolivia solo se dibujan las estaciones con lectura en el reporte', () => {
    const levels: BoLevels = { reportDate: '2026-11-12', fetchedAt: 0, url: '', readings: [{ station: bo.stations[0]!.name, river: 'X', prevDate: '2026-11-11', prevCm: 10, lastDate: '2026-11-12', lastCm: 12, zeroCm: null, trend: 'rising' }] };
    const points = boPoints(bo, levels);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ source: 'bo', level: 12, trend: 'rising', state: 'unknown' });
    expect(boPoints(bo, null)).toEqual([]);
  });

  it('una estación de mareas por punto', () => {
    expect(tidePoints(tides)).toHaveLength(tides.stations.length);
  });

  it('el mapa base trae ríos de América del Sur con sus líneas, incluidos los grandes', () => {
    expect(geo.rivers.length).toBeGreaterThan(100);
    const names = new Set(geo.rivers.map((r) => r.name));
    for (const n of ['Paraná', 'Uruguay', 'Colorado', 'Madeira', 'Bío-Bío']) expect(names.has(n), n).toBe(true);
    for (const r of geo.rivers) for (const l of r.lines) expect(l.length % 2 === 0 && l.length >= 4).toBe(true);
  });
});

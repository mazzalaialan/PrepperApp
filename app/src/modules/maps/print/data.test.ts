import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Route, Track, Waypoint } from '@/core/model/types';
import { pickStopIndices, plannedRouteSheetInput, trackSheetInput, waypointRouteSheetInput } from './data';

const wp = (id: string, name: string, lat: number, lon: number, alt: number | null): Waypoint => ({ ...newEntity<Waypoint>({ name, lat, lon, alt, icon: 'pin', notes: '', rainAlerts: false }), id });

describe('datos de la hoja', () => {
  it('ruta de waypoints: puntos con su nombre, tramos con los dos rumbos y desnivel por las alturas', () => {
    const ws = new Map([
      ['a', wp('a', 'Base', -41.17, -71.44, 1000)],
      ['b', wp('b', 'Collado', -41.2, -71.45, 1500)],
      ['c', wp('c', 'Refugio', -41.21, -71.43, 1300)],
    ]);
    const route = { ...newEntity<Route>({ name: 'Travesía', waypointIds: ['a', 'b', 'c', 'borrado'], notes: '' }) };
    const input = waypointRouteSheetInput(route, ws);
    expect(input.points.map((p) => p.name)).toEqual(['Base', 'Collado', 'Refugio']); // el waypoint borrado se omite
    expect(input.legs).toHaveLength(2);
    expect(input.legs[0]).toMatchObject({ from: 1, to: 2, ascentM: 500, descentM: 0 });
    expect(input.legs[1]).toMatchObject({ ascentM: 0, descentM: 200 });
    // el magnético difiere del geográfico por la declinación del lugar (varios grados al oeste en el sur de la Argentina)
    const l = input.legs[0]!;
    expect(l.bearingTrueDeg).not.toBeNull();
    expect(Math.abs(l.bearingTrueDeg! - l.bearingMagDeg!)).toBeGreaterThan(3);
    expect(Math.abs(l.bearingTrueDeg! - l.bearingMagDeg!)).toBeLessThan(15);
    expect(input.declinationDeg).toBeGreaterThan(3);
  });

  it('ruta que viene de un track: los tramos son entre sus waypoints, no entre cada punto de la línea', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ lat: -41.17 - i * 0.001, lon: -71.44 }));
    const route = { ...newEntity<Route>({ name: 'Wikiloc', waypointIds: [], notes: '' }), line, stops: [{ name: 'Cima', lat: line[20]!.lat, lon: line[20]!.lon }, { name: 'Refugio', lat: line[35]!.lat, lon: line[35]!.lon }] };
    const input = plannedRouteSheetInput(route);
    expect(input.points.map((p) => p.name)).toEqual(['Inicio', 'Cima', 'Refugio', 'Fin']);
    expect(input.legs).toHaveLength(3);
    expect(input.stopIdx).toEqual([0, 20, 35, 49]);
    expect(input.legs[0]!.distanceM).toBeGreaterThan(2100);
  });

  it('ruta que viene de un track sin waypoints: un solo tramo Inicio → Fin, como la hoja del track', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ lat: -41.17 - i * 0.001, lon: -71.44 }));
    const input = plannedRouteSheetInput({ ...newEntity<Route>({ name: 'W', waypointIds: [], notes: '' }), line, stops: [] });
    expect(input.legs).toHaveLength(1);
    expect(input.points.map((p) => p.name)).toEqual(['Inicio', 'Fin']);
  });

  it('track sin waypoints: puntos intermedios que siguen el recorrido (una curva se respeta, un tramo recto no se parte)', () => {
    // 5 km al norte en recta, giro a 90° y 5 km al este en recta, con un punto cada 50 m.
    const line = [
      ...Array.from({ length: 101 }, (_, i) => ({ lat: -41 + i * 0.00045, lon: -71 })),
      ...Array.from({ length: 100 }, (_, i) => ({ lat: -41 + 100 * 0.00045, lon: -71 + (i + 1) * 0.0006 })),
    ];
    const idx = pickStopIndices(line);
    expect(idx).toContain(100); // la esquina
    expect(idx.length).toBeLessThanOrEqual(8);
    expect(idx.length).toBeGreaterThanOrEqual(3);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(line.length - 1);
    // una ida y vuelta (inicio = fin) también marca el punto de giro
    const ida = [...line.slice(0, 101), ...line.slice(0, 100).reverse()];
    expect(pickStopIndices(ida)).toContain(100);
  });

  it('ruta planificada: puntos numerados sin nombre y piernas con rumbo geográfico y magnético', () => {
    const route = { ...newEntity<Route>({ name: 'Plan', waypointIds: [], notes: '' }), line: [{ lat: -41.17, lon: -71.44 }, { lat: -41.2, lon: -71.44 }, { lat: -41.2, lon: -71.4 }] };
    const input = plannedRouteSheetInput(route);
    expect(input.points.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(input.points.every((p) => p.name === '')).toBe(true);
    expect(input.legs).toHaveLength(2);
    expect(input.legs[0]!.bearingTrueDeg).toBeCloseTo(180, 3); // al sur
    expect(input.legs[1]!.bearingTrueDeg).toBeCloseTo(90, 0); // al este
    expect(input.legs[0]!.distanceM).toBeGreaterThan(3300);
    expect(() => plannedRouteSheetInput({ ...route, line: [] })).toThrow('NO_ROUTE');
  });

  it('track: Inicio, los waypoints en el orden en que se pasan y Fin; tramos por el recorrido y desnivel por las alturas', () => {
    const seg: Track['segments'][number] = [
      [-41.16, -71.42, 1000],
      [-41.17, -71.43, 1100],
      [-41.18, -71.43, 1400],
      [-41.19, -71.44, 1300],
      [-41.2, -71.45, 1500],
    ];
    const track = {
      ...newEntity<Track>({ name: 'Cruce', desc: '', source: 'Wikiloc', link: null, segments: [seg], waypoints: [], distanceM: 0, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '' }),
      // fuera de orden a propósito
      waypoints: [
        { name: 'Arroyo', lat: -41.19, lon: -71.44, ele: 1300, desc: '' },
        { name: 'Lomada', lat: -41.17, lon: -71.43, ele: 1100, desc: '' },
      ],
    };
    const input = trackSheetInput(track);
    expect(input.points.map((p) => p.name)).toEqual(['Inicio', 'Lomada', 'Arroyo', 'Fin']);
    expect(input.legs).toHaveLength(3);
    // por el recorrido, un tramo no mide menos que la recta
    expect(input.legs[1]!.distanceM).toBeGreaterThan(1000);
    expect(input.legs[1]!.ascentM).toBeGreaterThanOrEqual(300);
    expect(input.legs.every((l) => l.bearingTrueDeg !== null && l.bearingMagDeg !== null)).toBe(true);
    expect(input.subtitle).toBe('Wikiloc');
  });
});

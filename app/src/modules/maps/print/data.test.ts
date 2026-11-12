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

  it('track con waypoints (estacionamiento, descanso): se usan junto con los cambios de rumbo', () => {
    // 5 km al norte en recta, giro a 90° y 5 km al este, con un punto cada 50 m
    const seg: Track['segments'][number] = [
      ...Array.from({ length: 101 }, (_, i) => [-41 + i * 0.00045, -71, 1000 + i] as [number, number, number]),
      ...Array.from({ length: 100 }, (_, i) => [-41 + 100 * 0.00045, -71 + (i + 1) * 0.0006, 1100] as [number, number, number]),
    ];
    const track = {
      ...newEntity<Track>({ name: 'L', desc: '', source: 'Wikiloc', link: null, segments: [seg], waypoints: [], distanceM: 0, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '' }),
      waypoints: [
        { name: 'Estacionamiento', lat: seg[30]![0], lon: seg[30]![1], ele: null, desc: '' },
        { name: 'Descanso', lat: seg[160]![0], lon: seg[160]![1], ele: null, desc: '' },
      ],
    };
    const input = trackSheetInput(track as Track);
    const names = input.points.map((p) => p.name);
    expect(names[0]).toBe('Inicio');
    expect(names[names.length - 1]).toBe('Fin');
    expect(names).toContain('Estacionamiento');
    expect(names).toContain('Descanso');
    // además, la esquina (cambio de rumbo): un punto sin nombre cerca del vértice 100
    const corner = input.points.find((p) => !['Inicio', 'Fin', 'Estacionamiento', 'Descanso'].includes(p.name) && Math.abs(p.lat - seg[100]![0]) < 0.0003 && Math.abs(p.lon - seg[100]![1]) < 0.0003);
    expect(corner).toBeDefined();
    expect(input.legs.length).toBe(input.points.length - 1);
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

  it('ruta que viene de un track sin waypoints: un solo tramo Inicio → Fin si es corto y recto', () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ lat: -41.17 - i * 0.001, lon: -71.44 }));
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

  it('waypoints con el mismo nombre se numeran, y uno pegado al inicio nombra al inicio', () => {
    const line = Array.from({ length: 90 }, (_, i) => [-41 - i * 0.0009, -71, 1000] as [number, number, number]);
    const wp = (name: string, k: number) => ({ name, lat: line[k]![0], lon: line[k]![1], ele: null, desc: '' });
    const track = { ...newEntity<Track>({ name: 'D', desc: '', source: 'Wikiloc', link: null, segments: [line], waypoints: [], distanceM: 0, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '' }), waypoints: [wp('Estacionamiento', 0), wp('Descanso', 20), wp('Descanso', 45), wp('Descanso', 70)] };
    const names = trackSheetInput(track as Track).points.map((p) => p.name);
    expect(names[0]).toBe('Inicio · Estacionamiento');
    expect(names).toEqual(expect.arrayContaining(['Descanso 1', 'Descanso 2', 'Descanso 3']));
    expect(names).not.toContain('Descanso');
  });

  it('ida y vuelta: el waypoint se ubica en la primera pasada y ningún tramo pasa de 3 km', () => {
    const out = Array.from({ length: 101 }, (_, i) => ({ lat: -41 - i * 0.0009, lon: -71 }));
    const line = [...out, ...out.slice(0, 100).reverse()];
    const route = { ...newEntity<Route>({ name: 'IV', waypointIds: [], notes: '' }), line, stops: [{ name: 'Mitad', lat: out[50]!.lat, lon: out[50]!.lon }] };
    const input = plannedRouteSheetInput(route);
    expect(input.stopIdx).toContain(50);
    expect(input.stopIdx).not.toContain(150);
    expect(Math.max(...input.legs.map((l) => l.distanceM))).toBeLessThanOrEqual(3000);
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
    // los waypoints van siempre, en orden, entre Inicio y Fin (puede haber además puntos de cambio de rumbo sin nombre)
    const named = input.points.map((p) => p.name).filter((n) => !n.startsWith('Punto '));
    expect(named).toEqual(['Inicio', 'Lomada', 'Arroyo', 'Fin']);
    expect(input.legs.length).toBeGreaterThanOrEqual(3);
    // por el recorrido, un tramo no mide menos que la recta
    expect(input.legs.every((l) => l.distanceM > 0)).toBe(true);
    expect(input.legs.every((l) => l.bearingTrueDeg !== null && l.bearingMagDeg !== null)).toBe(true);
    expect(input.subtitle).toBe('Wikiloc');
  });
});

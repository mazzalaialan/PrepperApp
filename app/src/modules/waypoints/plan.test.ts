import { describe, expect, it } from 'vitest';
import type { Route } from '@/core/model/types';
import { legsOf, lineLength, trackFromRoute } from './plan';

describe('rutas planificadas', () => {
  const line = [
    { lat: -41, lon: -71 },
    { lat: -40.9, lon: -71 }, // al norte, ~11 km
    { lat: -40.9, lon: -70.9 }, // al este, ~8,4 km
  ];
  it('arma las piernas con distancia y rumbo verdadero', () => {
    const legs = legsOf(line, () => 0);
    expect(legs).toHaveLength(2);
    expect(legs[0]!.n).toBe(1);
    expect(Math.round(legs[0]!.distanceM / 100)).toBe(111);
    expect(Math.round(legs[0]!.trueBearing)).toBe(0);
    expect(Math.round(legs[1]!.trueBearing)).toBe(90);
    expect(legs[1]!.cardinal).toBeTruthy();
  });
  it('el rumbo magnético es el verdadero menos la declinación (este: se resta)', () => {
    // Declinación 8° oeste (−8): magnético = verdadero + 8.
    expect(Math.round(legsOf(line, () => -8)[0]!.magneticBearing)).toBe(8);
    // Declinación 10° este: al norte verdadero, la brújula marca 350.
    expect(Math.round(legsOf(line, () => 10)[0]!.magneticBearing)).toBe(350);
  });
  it('sumas y casos chicos', () => {
    expect(Math.round(lineLength(line))).toBeGreaterThan(19_000);
    expect(legsOf([line[0]!], () => 0)).toEqual([]);
  });
  it('el track de una ruta se actualiza sin cambiar de id y no es grabado', () => {
    const route = { id: 'r1', name: 'Platita', waypointIds: [], notes: '', line } as unknown as Route;
    const first = trackFromRoute(route);
    expect(first.routeId).toBe('r1');
    expect(first.recorded).toBeFalsy();
    expect(first.segments[0]).toHaveLength(3);
    const second = trackFromRoute({ ...route, name: 'Platita 2', line: line.slice(0, 2) }, first);
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Platita 2');
    expect(second.segments[0]).toHaveLength(2);
  });
});

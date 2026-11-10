import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { nearestWithRole } from './roles';

const wp = (name: string, lat: number, lon: number, role?: Waypoint['role']) => newEntity<Waypoint>({ name, lat, lon, alt: null, icon: 'pin', notes: '', rainAlerts: false, role });

describe('lugares por tipo', () => {
  const here = { lat: -41.1, lon: -71.3 };
  const list = [wp('Casa', -41.1, -71.31), wp('Salida lejos', -41.5, -71.3, 'escape'), wp('Salida cerca', -41.12, -71.3, 'escape'), wp('Refugio', -41.13, -71.3, 'shelter')];
  it('elige el más cercano del tipo pedido', () => {
    expect(nearestWithRole(list, 'escape', here)?.waypoint.name).toBe('Salida cerca');
    expect(nearestWithRole(list, 'shelter', here)?.waypoint.name).toBe('Refugio');
  });
  it('sin ninguno del tipo, o más lejos que el tope, da null', () => {
    expect(nearestWithRole(list, 'water', here)).toBeNull();
    expect(nearestWithRole(list, 'escape', here, 1000)).toBeNull();
  });
  it('un lugar común (sin tipo) no cuenta', () => {
    expect(nearestWithRole([wp('Casa', -41.1, -71.31)], 'escape', here)).toBeNull();
  });
});

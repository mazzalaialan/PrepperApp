import { describe, expect, it } from 'vitest';
import type { Location, Lot, Waypoint } from '@/core/model/types';
import { hazardNotification } from '@/core/notifications/format';
import { stockPlaces } from './stockServer';

const meta = { createdAt: '', updatedAt: '', deletedAt: null };
const loc = (id: string, name: string, parentId: string | null, waypointId: string | null = null): Location => ({ id, name, parentId, depth: 1, notes: '', waypointId, kitType: null, ...meta });
const lot = (id: string, locationId: string, quantity = 1) => ({ id, locationId, quantity, itemId: 'i', ...meta }) as unknown as Lot;
const wp = (id: string, lat: number, lon: number): Waypoint => ({ id, name: id, lat, lon, alt: null, icon: 'pin', notes: '', rainAlerts: false, ...meta });

describe('reserva cerca de peligros naturales', () => {
  it('un punto por waypoint donde hay algo guardado; los estantes heredan el de la casa', () => {
    const locations = new Map(
      [loc('casa', 'Casa', null, 'w1'), loc('sotano', 'Sótano', 'casa'), loc('estante', 'Estante 3', 'sotano'), loc('auto', 'Auto', null), loc('galpon', 'Galpón', null, 'w2')].map((l) => [l.id, l]),
    );
    const waypoints = new Map([
      ['w1', wp('w1', -34.92345, -57.95)],
      ['w2', wp('w2', -35, -58)],
    ]);
    const places = stockPlaces(locations, [lot('a', 'estante'), lot('b', 'auto'), lot('c', 'galpon', 0)], waypoints);
    expect(places).toEqual([{ id: 'w1', label: 'Casa', lat: -34.92, lon: -57.95 }]);
  });

  it('el aviso dice dónde hay reserva', () => {
    const { body } = hazardNotification(
      { placeId: 'stock:w1', label: 'Casa', fixAt: null, kind: 'FL', name: 'Inundación en el Salado', distanceKm: 20, bearing: 90, level: 'Orange', stock: ['Casa'], url: '' },
      'es',
    );
    expect(body).toContain('Tenés reserva cerca: Casa');
  });
});

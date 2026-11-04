import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, useSettings } from '@/core/settings/settings';
import type { Waypoint } from '@/core/model/types';
import { useWaypoints } from '@/modules/waypoints/store';
import { rainBody } from './rainServer';
import { useRainWatch } from './rainWatch';

const wp = (id: string, rainAlerts: boolean): Waypoint => ({
  id,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  name: `Lugar ${id}`,
  lat: -41.167891,
  lon: -71.434212,
  alt: null,
  icon: 'pin',
  notes: 'secreto',
  rainAlerts,
});

describe('avisos de lluvia con la app cerrada', () => {
  beforeEach(() => {
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS, serverLocation: true } });
    useWaypoints.setState({ waypoints: new Map([['a', wp('a', true)], ['b', wp('b', false)]]) });
    useRainWatch.setState({ lastHere: null });
  });

  it('manda solo los lugares con aviso, redondeados y sin notas', () => {
    expect(rainBody()).toEqual({ places: [{ id: 'a', label: 'Lugar a', lat: -41.17, lon: -71.43, fixAt: null }], keepHere: true });
  });

  it('con GPS en esta sesión manda "donde estoy" con su hora', () => {
    useRainWatch.setState({ lastHere: { lat: -34.60372, lon: -58.38157, at: Date.parse('2026-11-03T12:00:00Z') } });
    const { places, keepHere } = rainBody();
    expect(keepHere).toBe(false);
    expect(places[0]).toEqual({ id: 'here', label: null, lat: -34.6, lon: -58.38, fixAt: '2026-11-03T12:00:00.000Z' });
  });

  it('sin "usar mi ubicación" manda solo los waypoints (el servidor borra la ubicación)', () => {
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS, serverLocation: false } });
    useRainWatch.setState({ lastHere: { lat: 1, lon: 1, at: 0 } });
    expect(rainBody()).toEqual({ places: [{ id: 'a', label: 'Lugar a', lat: -41.17, lon: -71.43, fixAt: null }], keepHere: false });
  });

  it('la ubicación viene activada por defecto', () => {
    expect(DEFAULT_SETTINGS.serverLocation).toBe(true);
  });
});

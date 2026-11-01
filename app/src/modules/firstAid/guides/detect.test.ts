import { describe, expect, it } from 'vitest';
import type { EmergencyData } from '@/modules/emergency/data';
import data from '@/modules/emergency/emergency-data.json';
import places from '@/modules/emergency/places-ar.json';
import { placeFinder } from '@/modules/emergency/places';
import { minutesByCar, nearestHelp, WILD_MINUTES } from './detect';

const finder = placeFinder(places as unknown as Parameters<typeof placeFinder>[0]);
const help = (lat: number, lon: number) => nearestHelp(lat, lon, data as unknown as EmergencyData, finder)!;

describe('¿ciudad o zona agreste?', () => {
  it('una hora en auto son unos 46 km en línea recta', () => {
    expect(minutesByCar(46)).toBeLessThanOrEqual(WILD_MINUTES);
    expect(minutesByCar(50)).toBeGreaterThan(WILD_MINUTES);
  });

  it('en una ciudad la ayuda está cerca', () => {
    const obelisco = help(-34.6037, -58.3816);
    expect(obelisco.env).toBe('city');
    expect(obelisco.km).toBeLessThan(3);
  });

  it('lejos de todo es zona agreste', () => {
    // Puna de Atacama y meseta central de Santa Cruz.
    for (const [lat, lon] of [
      [-25.0, -67.6],
      [-48.0, -70.0],
    ]) {
      const far = help(lat!, lon!);
      expect(far.env, `${lat}, ${lon}: ${far.name} a ${far.km} km`).toBe('wild');
    }
  });
});

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

  it('en pueblos con bomberos o en ciudades turísticas, la ayuda está cerca', () => {
    for (const [lat, lon] of [
      [-41.134, -71.31], // Bariloche
      [-27.687, -67.616], // Fiambalá
      [-26.85, -65.71], // Tafí del Valle
    ]) {
      expect(help(lat!, lon!).env, `${lat}, ${lon}`).toBe('city');
    }
  });

  it('lejos de todo es zona agreste, aunque haya un caserío cerca', () => {
    for (const [lat, lon] of [
      [-25.0, -67.6], // Puna de Atacama
      [-48.0, -70.0], // meseta central de Santa Cruz
      [-32.65, -70.0], // Plaza de Mulas, Aconcagua
      [-47.44, -70.93], // Bajo Caracoles, Ruta 40
      [-27.3, -68.15], // Ruta 60 camino al Paso San Francisco
    ]) {
      const far = help(lat!, lon!);
      expect(far.env, `${lat}, ${lon}: ${far.name} a ${far.km} km`).toBe('wild');
    }
  });
});

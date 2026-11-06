import { describe, expect, it } from 'vitest';
import data from './borders-data.json';
import { distanceToCountry, type BordersData } from './borders';

const B = data as unknown as BordersData;
const km = (c: 'AR' | 'CL', lat: number, lon: number) => distanceToCountry(B, c, lat, lon) / 1000;

describe('fronteras Argentina–Chile', () => {
  it('adentro del país, 0', () => {
    expect(km('AR', -34.6, -58.38)).toBe(0); // Buenos Aires
    expect(km('CL', -33.45, -70.66)).toBe(0); // Santiago
  });

  it('distancia a la frontera del otro país', () => {
    expect(km('CL', -32.89, -68.84)).toBeGreaterThan(50); // Mendoza capital
    expect(km('CL', -32.82, -69.92)).toBeLessThan(25); // Puente del Inca
    expect(km('AR', -33.45, -70.66)).toBeGreaterThan(50); // Santiago
    expect(km('AR', -51.73, -72.51)).toBeLessThan(30); // Puerto Natales
    expect(km('CL', -34.6, -58.38)).toBeGreaterThan(1000); // Buenos Aires
  });
});

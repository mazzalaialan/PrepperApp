import { describe, expect, it } from 'vitest';
import { distanceMeters } from './geo';
import { formatUtm, fromUtm, toUtm, utmZone } from './utm';

describe('UTM', () => {
  it('zonas de la Argentina', () => {
    expect(utmZone(-71.31)).toBe(19); // Bariloche
    expect(utmZone(-68.3)).toBe(19); // Ushuaia
    expect(utmZone(-65.4)).toBe(20); // Salta
    expect(utmZone(-58.4)).toBe(21); // Buenos Aires
  });

  it('en el meridiano central: este 500 000; en el ecuador: norte 0 o 10 000 000', () => {
    const north = toUtm({ lat: 0, lon: -69 }, 19);
    expect(north.easting).toBeCloseTo(500_000, 3);
    expect(north.northing).toBeCloseTo(0, 3);
    const south = toUtm({ lat: -0.000001, lon: -69 }, 19);
    expect(south.hemisphere).toBe('S');
    expect(south.northing).toBeCloseTo(10_000_000, 0);
  });

  it('ida y vuelta: menos de 1 mm', () => {
    for (const p of [
      { lat: -41.1335, lon: -71.3103 },
      { lat: -54.8, lon: -68.3 },
      { lat: -24.78, lon: -65.41 },
      { lat: -34.6, lon: -58.38 },
      { lat: 10.5, lon: -66.9 },
    ]) {
      const back = fromUtm(toUtm(p));
      expect(distanceMeters(p, back)).toBeLessThan(0.001);
    }
  });

  it('factor de escala 0,9996 sobre el meridiano central (contra el arco real del meridiano en el elipsoide)', () => {
    // Radio de curvatura del meridiano a la latitud media: M = a(1-e²)/(1-e² sin²φ)^1,5
    const e2 = 0.0066943799901413165;
    const phi = (-41.005 * Math.PI) / 180;
    const M = (6378137 * (1 - e2)) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5;
    const real = M * ((0.01 * Math.PI) / 180);
    const a = toUtm({ lat: -41, lon: -69 }, 19);
    const b = toUtm({ lat: -41.01, lon: -69 }, 19);
    const grid = Math.hypot(a.easting - b.easting, a.northing - b.northing);
    expect(grid / real).toBeCloseTo(0.9996, 5);
  });

  it('el norte crece hacia el norte y el este hacia el este', () => {
    const base = toUtm({ lat: -41, lon: -71 }, 19);
    expect(toUtm({ lat: -40.9, lon: -71 }, 19).northing).toBeGreaterThan(base.northing);
    expect(toUtm({ lat: -41, lon: -70.9 }, 19).easting).toBeGreaterThan(base.easting);
  });

  it('formato y letra de banda', () => {
    const u = toUtm({ lat: -41.1335, lon: -71.3103 });
    expect(u.band).toBe('G');
    expect(formatUtm(u)).toMatch(/^19G \d{3} \d{3} E \d \d{3} \d{3} N$/);
  });
});

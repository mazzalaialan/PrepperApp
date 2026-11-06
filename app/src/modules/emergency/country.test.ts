import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nearestHelp } from '@/modules/firstAid/guides/detect';
import { nearestRadio, officialNearby, type EmergencyData } from './data';
import { placeFinder, type PlacesData } from './places';

/** Paquetes de Chile y Uruguay (tools/country-data), tal como los baja la app. */
const pkg = (cc: 'CL' | 'UY') => JSON.parse(readFileSync(new URL(`../../../public/data/${cc}.json`, import.meta.url), 'utf8')) as EmergencyData & PlacesData;

describe('paquetes de Chile y Uruguay', () => {
  const cl = pkg('CL');
  const uy = pkg('UY');
  const clPlaces = placeFinder(cl);
  const uyPlaces = placeFinder(uy);

  it('traen bomberos, policía, salud, radios y localidades', () => {
    for (const p of [cl, uy]) {
      expect(p.fire.length).toBeGreaterThan(20);
      expect(p.police.length).toBeGreaterThan(100);
      expect(p.health.length).toBeGreaterThan(100);
      expect(p.radio.length).toBeGreaterThan(10);
      expect(p.places.length).toBeGreaterThan(100);
    }
    // Chile: todo de OpenStreetMap.
    expect(cl.osm).toBe(true);
  });

  it('Uruguay: comisarías, bomberos y ASSE oficiales, completados con OpenStreetMap', () => {
    expect(uy.osm).toBeUndefined();
    expect(uy.police.filter((p) => !p.osm).length).toBeGreaterThan(250);
    expect(uy.fire.filter((p) => !p.osm).length).toBeGreaterThan(70);
    expect(uy.health.filter((p) => !p.osm && p.type === 'Hospital').length).toBeGreaterThan(40);
    // Montevideo: una comisaría oficial con teléfono, y algún lugar de OpenStreetMap (mutualistas).
    const near = officialNearby(uy, -34.9, -56.18, 3000);
    expect(near.some((p) => p.kind === 'police' && p.source === 'official' && p.phone)).toBe(true);
    expect(near.some((p) => p.source === 'osm')).toBe(true);
  });

  it('radio más cercana: Bío-Bío en Santiago, Radio Uruguay en Montevideo', () => {
    expect(nearestRadio(cl, -33.45, -70.66, 1)[0]).toMatchObject({ call: 'Radio Bío-Bío', city: 'Santiago', fm: 99.7 });
    expect(nearestRadio(uy, -34.9, -56.18, 1)[0]).toMatchObject({ call: 'CX26 Radio Uruguay', am: 1050 });
    expect(nearestRadio(uy, -30.9, -55.55, 1)[0]).toMatchObject({ city: 'Rivera', fm: 93.9 });
  });

  it('ciudad o zona agreste', () => {
    expect(nearestHelp(-33.45, -70.66, cl, clPlaces)!.env).toBe('city'); // Santiago
    expect(nearestHelp(-34.9, -56.18, uy, uyPlaces)!.env).toBe('city'); // Montevideo
    expect(nearestHelp(-24.5, -68.6, cl, clPlaces)!.env).toBe('wild'); // Desierto de Atacama, al pie de la cordillera
    expect(nearestHelp(-50.9, -73.2, cl, clPlaces)!.env).toBe('wild'); // Torres del Paine
  });

  it('lugares cercanos sin conexión, marcados como de OpenStreetMap', () => {
    const near = officialNearby(cl, -33.45, -70.66, 5000);
    expect(near.some((p) => p.kind === 'fire')).toBe(true);
    expect(near.every((p) => p.source === 'osm')).toBe(true);
  });

  it('ubica localidades por nombre', () => {
    expect(clPlaces.find('Valparaíso')?.label).toMatch(/^Valpara/);
    expect(uyPlaces.find('Salto')?.label).toMatch(/^Salto/);
  });
});

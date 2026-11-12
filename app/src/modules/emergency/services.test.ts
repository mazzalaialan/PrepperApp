import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeNearby, nearestPerKind } from './data';
import { osmFuels, osmKind, parseNearby } from './osm';
import { SERVICE_CATEGORIES, serviceNearby, type ServiceData } from './services';

const path = (file: string) => new URL(`../../../public/data/${file}`, import.meta.url);
const file = (category: string, cc: string) => JSON.parse(readFileSync(path(`${category}-${cc}.json`), 'utf8')) as ServiceData;

describe('servicios (estaciones, farmacias, agua, refugios…)', () => {
  it('OpenStreetMap: cada etiqueta da su tipo, y las estaciones sus combustibles', () => {
    expect(osmKind({ amenity: 'fuel' })).toBe('fuel');
    expect(osmKind({ amenity: 'pharmacy' })).toBe('pharmacy');
    expect(osmKind({ emergency: 'defibrillator' })).toBe('aed');
    expect(osmKind({ amenity: 'veterinary' })).toBe('vet');
    expect(osmKind({ shop: 'tyres' })).toBe('tyres');
    expect(osmKind({ shop: 'car_repair' })).toBe('carRepair');
    expect(osmKind({ natural: 'spring' })).toBe('water');
    expect(osmKind({ tourism: 'alpine_hut' })).toBe('shelter');
    expect(osmKind({ amenity: 'atm' })).toBe('atm');
    expect(osmFuels({ 'fuel:octane_95': 'yes', 'fuel:diesel': 'yes', 'fuel:cng': 'no', 'fuel:lpg': 'yes' })).toEqual(['gasoline', 'diesel', 'lpg']);
    const [p] = parseNearby([{ type: 'node', id: 1, lat: -41.13, lon: -71.3, tags: { amenity: 'fuel', brand: 'YPF', 'fuel:diesel': 'yes' } }], -41.13, -71.31);
    expect(p).toMatchObject({ kind: 'fuel', name: 'YPF', detail: 'YPF', fuels: ['diesel'], source: 'osm' });
  });

  it('agua: aclara si una vertiente es potable y descarta la canilla no potable', () => {
    const items = parseNearby(
      [
        { type: 'node', id: 1, lat: -41, lon: -71, tags: { natural: 'spring' } },
        { type: 'node', id: 2, lat: -41, lon: -71.001, tags: { amenity: 'drinking_water', drinking_water: 'no' } },
        { type: 'node', id: 3, lat: -41, lon: -71.002, tags: { tourism: 'alpine_hut', name: 'Refugio Frey', ele: '1700' } },
        { type: 'node', id: 4, lat: -41, lon: -71.003, tags: { emergency: 'defibrillator', 'defibrillator:location': 'En la recepción' } },
      ],
      -41,
      -71,
    );
    expect(items.map((p) => p.kind)).toEqual(['water', 'shelter', 'aed']);
    expect(items[0]!.detail).toBe('Vertiente (potabilidad desconocida)');
    expect(items[1]).toMatchObject({ detail: 'Refugio de montaña', note: '1700 m' });
    expect(items[2]!.note).toBe('En la recepción');
  });

  it('hay un archivo por categoría y país, con lugares ubicados', () => {
    for (const cc of ['AR', 'CL', 'UY', 'BO', 'PE'])
      for (const category of SERVICE_CATEGORIES) {
        expect(existsSync(path(`${category}-${cc}.json`)), `${category}-${cc}.json`).toBe(true);
        const d = file(category, cc);
        expect(d.country).toBe(cc);
        expect(d.category).toBe(category);
        expect(d.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const s of d.places) expect(Number.isFinite(s.lat) && Number.isFinite(s.lon)).toBe(true);
      }
    // Los que siempre tienen que estar llenos.
    for (const cc of ['AR', 'CL', 'UY', 'BO', 'PE']) for (const category of ['fuel', 'pharmacy', 'atm']) expect(file(category, cc).places.length, `${category}-${cc}`).toBeGreaterThan(100);
  });

  it('estaciones de Argentina: listado oficial (con combustibles) más las que faltan de OpenStreetMap', () => {
    const d = file('fuel', 'AR');
    expect(d.osm).toBeUndefined();
    const official = d.places.filter((s) => !s.osm);
    expect(official.length).toBeGreaterThan(3000);
    expect(official.filter((s) => s.fuels?.includes('gasoline')).length).toBeGreaterThan(official.length * 0.9);
    // Cerca del Obelisco hay estaciones oficiales.
    const near = serviceNearby(d, -34.6037, -58.3816).filter((p) => p.distance < 2000);
    expect(near.some((p) => p.source === 'official' && p.kind === 'fuel')).toBe(true);
  });

  it('el mismo lugar de OpenStreetMap en vivo no se repite y le pasa el teléfono', () => {
    const d: ServiceData = { country: 'AR', category: 'fuel', generatedAt: '2026-11-12', source: '', places: [{ name: 'YPF', lat: -34.6, lon: -58.4, fuels: ['gasoline'] }] };
    const live = parseNearby([{ type: 'node', id: 2, lat: -34.6005, lon: -58.4, tags: { amenity: 'fuel', name: 'YPF Centro', phone: '011 4444-5555' } }], -34.6, -58.41);
    const merged = mergeNearby(serviceNearby(d, -34.6, -58.41), live);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'YPF', phone: '011 4444-5555', fuels: ['gasoline'] });
  });

  it('"lo más cercano" cuenta cada servicio como un grupo aparte', () => {
    const places = [...serviceNearby(file('fuel', 'UY'), -34.9, -56.16), ...serviceNearby(file('pharmacy', 'UY'), -34.9, -56.16)];
    const near = nearestPerKind(places, 3);
    expect(near.filter((p) => p.kind === 'fuel')).toHaveLength(3);
    expect(near.filter((p) => p.kind === 'pharmacy')).toHaveLength(3);
  });
});

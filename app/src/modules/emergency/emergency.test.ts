import { describe, expect, it } from 'vitest';
import data from './emergency-data.json';
import { mergeNearby, nearestPerKind, nearestRadio, officialNearby, type EmergencyData, type NearbyPlace } from './data';
import { dialable, mapsUrl } from './national';
import { describeAddress, osmKind, parseNearby, parseSurroundings } from './osm';

const D = data as EmergencyData;

describe('datos oficiales incluidos', () => {
  it('cuarteles de todo el país, comisarías y salud de la Provincia de Buenos Aires, radios', () => {
    expect(D.fire.length).toBeGreaterThan(1000);
    expect(D.police.length).toBeGreaterThan(300);
    expect(D.health.length).toBeGreaterThan(2000);
    expect(D.radio.find((r) => r.call === 'LRA 30')).toMatchObject({ am: 590, fm: 95.5 });
  });

  it('cerca de Bariloche aparece algún cuartel; la emisora más cercana es LRA 30', () => {
    const near = officialNearby(D, -41.1335, -71.3103, 15_000);
    expect(near.some((p) => p.kind === 'fire')).toBe(true);
    expect(near.every((p) => p.distance <= 15_000)).toBe(true);
    expect(nearestRadio(D, -41.1335, -71.3103)[0]!.call).toBe('LRA 30');
  });

  it('en zona agreste, lo más cercano de cada tipo aunque esté lejos', () => {
    // Meseta de Somuncurá: no hay nada a menos de 30 km.
    const all = officialNearby(D, -41.3, -67.2, Infinity);
    expect(all.filter((p) => p.distance <= 30_000)).toHaveLength(0);
    const nearest = nearestPerKind(all, 1);
    const fire = nearest.find((p) => p.kind === 'fire')!;
    expect(fire.distance).toBeGreaterThan(30_000);
    expect(nearest.filter((p) => p.kind === 'fire')).toHaveLength(1);
    // Ordenados del más cercano al más lejano.
    expect(nearest.map((p) => p.distance)).toEqual([...nearest.map((p) => p.distance)].sort((a, b) => a - b));
  });
});

describe('unión de fuentes', () => {
  const place = (over: Partial<NearbyPlace>): NearbyPlace => ({
    key: 'k', kind: 'fire', name: 'X', phone: '', address: '', lat: -34.6, lon: -58.4, distance: 100, source: 'official', detail: '', ...over,
  });

  it('el mismo cuartel en las dos fuentes queda uno, con el teléfono de OpenStreetMap', () => {
    const merged = mergeNearby([place({ key: 'o' })], [place({ key: 'osm', source: 'osm', phone: '100', lat: -34.6005, distance: 120 }), place({ key: 'far', source: 'osm', lat: -34.7, distance: 11_000 })]);
    expect(merged.map((p) => p.key)).toEqual(['o', 'far']);
    expect(merged[0]!.phone).toBe('100');
  });

  it('un hospital y un centro de salud en el mismo lugar cuentan como el mismo', () => {
    const merged = mergeNearby([place({ kind: 'hospital' })], [place({ kind: 'medical', source: 'osm', key: 'm' })]);
    expect(merged).toHaveLength(1);
  });
});

describe('teléfonos y mapas', () => {
  it('para marcar: solo dígitos, y el primero si hay varios', () => {
    expect(dialable('0800-333-0160')).toBe('08003330160');
    expect(dialable('0336-5408830/36')).toBe('03365408830');
    expect(dialable('+54 11 4361 4444')).toBe('+541143614444');
    expect(dialable('-')).toBe('');
    // Números cortos de celular (Chile, Uruguay).
    expect(dialable('*4141')).toBe('*4141');
  });

  it('Google Maps: por dirección o, si no hay, por coordenadas', () => {
    expect(mapsUrl('Pellegrini 1151, Carhué', null, null)).toBe('https://www.google.com/maps/search/?api=1&query=Pellegrini%201151%2C%20Carhu%C3%A9');
    expect(mapsUrl('', -34.6, -58.38)).toContain('query=-34.600000%2C-58.380000');
    expect(mapsUrl('', null, null)).toBeNull();
  });
});

describe('OpenStreetMap', () => {
  it('tipo de lugar según sus etiquetas', () => {
    expect(osmKind({ amenity: 'police' })).toBe('police');
    expect(osmKind({ emergency: 'ambulance_station' })).toBe('medical');
    expect(osmKind({ office: 'government', name: 'Defensa Civil Municipal' })).toBe('civilDefense');
    expect(osmKind({ amenity: 'school' })).toBeNull();
  });

  it('lugares cercanos con teléfono, dirección y distancia', () => {
    const [p] = parseNearby(
      [{ type: 'way', id: 7, center: { lat: -34.61, lon: -58.38 }, tags: { amenity: 'fire_station', name: 'Cuartel 1', 'contact:phone': '100', 'addr:street': 'Av. Siempreviva', 'addr:housenumber': '742' } }],
      -34.6,
      -58.38,
    );
    expect(p).toMatchObject({ key: 'osm-way-7', kind: 'fire', phone: '100', address: 'Av. Siempreviva 742' });
    expect(p!.distance).toBeGreaterThan(1000);
  });

  it('dirección, calles cercanas, ruta y mojón', () => {
    expect(describeAddress({ address: { road: 'Av. Corrientes', house_number: '1000', suburb: 'San Nicolás', city: 'Buenos Aires' } })).toEqual({
      address: 'Av. Corrientes 1000',
      locality: 'San Nicolás, Buenos Aires',
      road: 'Av. Corrientes',
    });
    const s = parseSurroundings(
      [
        { type: 'way', id: 1, center: { lat: -41.2436, lon: -71.3004 }, tags: { highway: 'trunk', ref: 'RN 40', name: 'Ruta Nacional 40' } },
        { type: 'way', id: 2, center: { lat: -41.2437, lon: -71.3 }, tags: { highway: 'residential', name: 'Los Coihues' } },
        { type: 'way', id: 3, center: { lat: -41.2436, lon: -71.3004 }, tags: { highway: 'footway', name: 'Sendero' } },
        { type: 'node', id: 4, lat: -41.25, lon: -71.3, tags: { highway: 'milestone', distance: '1990' } },
      ],
      -41.2435,
      -71.3003,
      'Ruta Nacional 40',
    );
    expect(s.roads).toEqual(['RN 40']);
    expect(s.nearbyStreets).toEqual(['Los Coihues']);
    expect(s.milestone?.km).toBe('1990');
  });
});

describe('lo más cercano de cada tipo', () => {
  const p = (kind: NearbyPlace['kind'], distance: number): NearbyPlace => ({
    key: `${kind}${distance}`, kind, name: '', phone: '', address: '', lat: 0, lon: 0, distance, source: 'official', detail: '',
  });

  it('hospitales y ambulancias cuentan juntos como salud', () => {
    const out = nearestPerKind([p('fire', 90), p('hospital', 50), p('medical', 40), p('fire', 10), p('police', 300)], 1);
    expect(out.map((x) => x.key)).toEqual(['fire10', 'medical40', 'police300']);
  });
});

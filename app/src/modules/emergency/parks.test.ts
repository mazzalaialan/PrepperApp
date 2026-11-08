import { describe, expect, it } from 'vitest';
import parksJson from './parks-data.json';
import emergencyJson from './emergency-data.json';
import parksCL from '../../../public/data/parks-CL.json';
import parksBO from '../../../public/data/parks-BO.json';
import parksPE from '../../../public/data/parks-PE.json';
import { distanceToPark, inPark, mergeNearby, officialNearby, parkCountry, parksNear, withParks, type EmergencyData, type ParksData } from './data';

const P = parksJson as unknown as ParksData;
const D = emergencyJson as EmergencyData;
const park = (name: string) => P.parks.find((p) => p.name === name)!;

describe('parques nacionales', () => {
  it('todas las áreas tienen límites y página oficial', () => {
    expect(P.parks.length).toBeGreaterThan(40);
    for (const p of P.parks) {
      expect(p.area.length, p.name).toBeGreaterThan(0);
      expect(p.url).toMatch(/^https:\/\/www\.argentina\.gob\.ar\/parquesnacionales\//);
    }
  });

  it('la base del volcán Lanín está en el PN Lanín, que publica la 155,675', () => {
    // Base del volcán, lado de Tromen.
    const [here] = parksNear(P, -39.6, -71.45, 5000);
    expect(here!.park.name).toBe('Parque Nacional Lanín');
    expect(here!.distance).toBe(0);
    expect(here!.park.radio?.map((r) => r.freq)).toEqual(['155,675 MHz']);
  });

  it('Bariloche centro queda fuera del Nahuel Huapi; Pampa Linda, adentro', () => {
    expect(inPark(park('Parque Nacional Nahuel Huapi'), -41.226, -71.738)).toBe(true);
    expect(park('Parque Nacional Nahuel Huapi').radio?.map((r) => r.freq)).toEqual(['155,675 MHz', '150,335 MHz', '148,450 MHz']);
    expect(parksNear(P, -34.6037, -58.3816, 5000)).toHaveLength(0);
  });

  it('en Buscar cercanos: intendencias, y las seccionales de adentro con las frecuencias del parque', () => {
    const lat = -40.1569;
    const lon = -71.3526;
    const all = withParks(mergeNearby(officialNearby(D, lat, lon, 80_000), []), P, lat, lon);
    const office = all.find((p) => p.name === 'Intendencia · Parque Nacional Lanín')!;
    expect(office.phone).toBe('02972 42-7233');
    expect(office.radio?.[0]?.freq).toBe('155,675 MHz');
    const sectional = all.find((p) => p.key !== office.key && /parques nacionales|guardaparque/i.test(`${p.detail} ${p.name}`) && inPark(park('Parque Nacional Lanín'), p.lat, p.lon));
    expect(sectional?.radio?.[0]?.freq).toBe('155,675 MHz');
  });

  it('Nahuel Huapi y Los Arrayanes comparten intendencia: una sola fila', () => {
    const all = withParks([], P, -41.13, -71.31);
    const rows = all.filter((p) => p.phone === park('Parque Nacional Nahuel Huapi').phone || p.name.includes('Arrayanes'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.extraPhones?.map((e) => e.phone)).toContain('105');
  });
});

describe('áreas protegidas de Chile (CONAF)', () => {
  const CL = parksCL as unknown as ParksData;
  const both: ParksData = { source: '', parks: [...P.parks, ...CL.parks] };

  it('todas las áreas de CONAF, con página y ubicación', () => {
    expect(CL.parks.length).toBeGreaterThan(100);
    for (const p of CL.parks) expect(p.url, p.name).toMatch(/^https:\/\/www\.conaf\.cl\//);
    expect(CL.parks.filter((p) => p.area.length).length).toBeGreaterThan(95);
  });

  it('Torres del Paine publica la 143,800 para emergencias; la oficina es CONAF Magallanes', () => {
    const [here] = parksNear(both, -50.94, -72.97, 5000); // Lago Pehoé
    expect(here!.park.name).toBe('Parque Nacional Torres del Paine');
    expect(here!.park.radio?.[0]?.freq).toBe('143,800 MHz');
    expect(here!.park.office).toBe('CONAF Magallanes');
    expect(here!.park.emergency?.some((e) => e.phone === '130')).toBe(true);
  });

  it('en Buscar cercanos, una sola fila por oficina regional, con las frecuencias de sus áreas', () => {
    const rows = withParks([], both, -53.16, -70.91).filter((p) => p.name === 'CONAF Magallanes');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.radio?.map((r) => r.label)).toContain('VHF de emergencia de CONAF en Torres del Paine');
  });

  it('del lado argentino de la cordillera, el parque chileno vecino aparece cerca', () => {
    // Paso Mamuil Malal: límite entre el PN Lanín y el PN Villarrica.
    const near = parksNear(both, -39.585, -71.44, 5000).map((p) => p.park.name);
    expect(near).toContain('Parque Nacional Lanín');
    expect(near).toContain('Parque Nacional Villarrica');
  });
});

describe('parques de Bolivia (SERNAP) y Perú (SERNANP)', () => {
  const pe = parksPE as unknown as ParksData;
  const bo = parksBO as unknown as ParksData;
  const named = (d: ParksData, name: string) => d.parks.find((p) => p.name === name)!;

  it('traen el país, límites y contacto de cada área', () => {
    expect(pe.parks.length).toBeGreaterThan(90);
    expect(bo.parks.length).toBeGreaterThan(20);
    for (const [data, country] of [[pe, 'PE'], [bo, 'BO']] as const) {
      for (const p of data.parks) {
        expect(p.country, p.name).toBe(country);
        expect(p.area.length, p.name).toBeGreaterThan(0);
        expect(p.emergency?.length, p.name).toBeGreaterThan(0);
        expect(parkCountry(p)).toBe(country);
      }
    }
    // Ninguna lleva el nombre de un titular (las áreas privadas no se incluyen).
    expect(pe.parks.some((p) => /privada/i.test(p.name))).toBe(false);
  });

  it('Perú: el Huascarán y Machu Picchu', () => {
    // Laguna Llanganuco, en la Cordillera Blanca.
    const [here] = parksNear(pe, -9.03, -77.65, 1000);
    expect(here!.park.name).toBe('Parque Nacional Huascarán');
    expect(inPark(named(pe, 'Santuario Histórico Machupicchu'), -13.163, -72.545)).toBe(true);
    // Lima no está en ningún área.
    expect(parksNear(pe, -12.05, -77.04, 5000).every((p) => p.distance > 0)).toBe(true);
  });

  it('Bolivia: Sajama y Madidi, con el SERNAP como contacto', () => {
    expect(inPark(named(bo, 'Parque Nacional Sajama'), -18.108, -68.883)).toBe(true);
    expect(inPark(named(bo, 'Parque Nacional Madidi'), -14.0, -68.7)).toBe(true);
    expect(named(bo, 'Parque Nacional Sajama').emergency?.[0]?.phone).toBe('+591 2 2426304');
    expect(parksNear(bo, -16.5, -68.15, 1000)).toHaveLength(0); // La Paz
  });

  it('los países vecinos comparten sus parques en la cordillera (Chile ve Sajama, Perú ve Bolivia)', () => {
    // Parinacota (Chile) está a ~30 km de Sajama: el límite de 50 km de la pantalla los junta.
    const sajama = named(bo, 'Parque Nacional Sajama');
    expect(distanceToPark(sajama, -18.18, -69.14)).toBeLessThan(50_000);
  });
});

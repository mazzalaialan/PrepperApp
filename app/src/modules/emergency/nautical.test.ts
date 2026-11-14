import { describe, expect, it } from 'vitest';
import { isNautical, nauticalType, osmKind, parseNearby, SERVICE_SELECTORS } from './osm';
import { CATEGORY_KIND, SERVICE_CATEGORIES } from './services';

describe('náutica en Buscar cercanos', () => {
  it('reconoce marinas, rampas, guarderías, alquiler, combustible y talleres náuticos', () => {
    const casos: Record<string, string>[] = [
      { leisure: 'marina' },
      { leisure: 'slipway' },
      { amenity: 'boat_storage' },
      { amenity: 'boat_rental' },
      { waterway: 'fuel' },
      { amenity: 'fuel', boat: 'yes' },
      { amenity: 'fuel', marine: 'yes' },
      { shop: 'boat' },
      { shop: 'boat_repair' },
      { shop: 'ship_chandler' },
      { craft: 'boatbuilder' },
      { mooring: 'buoy' },
      { 'seamark:type': 'mooring' },
      { man_made: 'pier', name: 'Muelle Viejo' },
    ];
    for (const tags of casos) {
      expect(isNautical(tags), JSON.stringify(tags)).toBe(true);
      expect(osmKind(tags)).toBe('nautical');
    }
  });

  it('una estación de servicio común no es náutica, y un muelle tampoco', () => {
    expect(isNautical({ amenity: 'fuel' })).toBe(false);
    expect(osmKind({ amenity: 'fuel' })).toBe('fuel');
    // Muelles: solo con nombre y sin ser privados.
    expect(isNautical({ man_made: 'pier' })).toBe(false);
    expect(osmKind({ man_made: 'pier' })).toBeNull();
    expect(isNautical({ man_made: 'pier', name: 'Muelle de Pesca', access: 'private' })).toBe(false);
    expect(isNautical({ man_made: 'pier', name: 'Muelle de Pesca', access: 'no' })).toBe(false);
    expect(isNautical({ man_made: 'pier', name: 'Muelle de Pesca', access: 'yes' })).toBe(true);
    // Aunque tenga `mooring`, un muelle sin nombre o privado no entra.
    expect(isNautical({ man_made: 'pier', mooring: 'yes' })).toBe(false);
    expect(isNautical({ man_made: 'pier', name: 'Privado', mooring: 'yes', access: 'private' })).toBe(false);
  });

  it('el combustible para embarcaciones con boat=yes no se cuenta como estación de ruta', () => {
    expect(osmKind({ amenity: 'fuel', boat: 'yes' })).toBe('nautical');
  });

  it('el tipo que se muestra', () => {
    expect(nauticalType({ leisure: 'marina' })).toBe('Marina');
    expect(nauticalType({ leisure: 'slipway' })).toBe('Rampa para embarcaciones');
    expect(nauticalType({ waterway: 'fuel' })).toBe('Combustible para embarcaciones');
    expect(nauticalType({ shop: 'boat' })).toBe('Taller o comercio náutico');
    expect(nauticalType({ mooring: 'buoy' })).toBe('Amarra o boya');
    expect(nauticalType({ man_made: 'pier', name: 'X', mooring: 'yes' })).toBe('Muelle');
    expect(isNautical({ mooring: 'no' })).toBe(false);
  });

  it('la categoría está registrada y se consulta por sus etiquetas', () => {
    expect(SERVICE_CATEGORIES).toContain('nautical');
    expect(CATEGORY_KIND.nautical).toBe('nautical');
    expect(SERVICE_SELECTORS.nautical.join(' ')).toContain('"leisure"="marina"');
  });

  it('la consulta en vivo arma el lugar con su tipo y su nombre', () => {
    const [p] = parseNearby([{ type: 'node', id: 1, lat: -34.4, lon: -58.5, tags: { leisure: 'marina', name: 'Marina Nueva' } }], -34.4, -58.5);
    expect(p).toMatchObject({ kind: 'nautical', name: 'Marina Nueva', detail: 'Marina' });
  });
});

describe('tipos de Náutica que se eligen', () => {
  it('cada texto de tipo tiene su identificador y viceversa', async () => {
    const { NAUTICAL_IDS, NAUTICAL_LABEL, nauticalIdOf } = await import('./nautical');
    for (const id of NAUTICAL_IDS) expect(nauticalIdOf(NAUTICAL_LABEL[id])).toBe(id);
    expect(nauticalIdOf('otra cosa')).toBeNull();
    expect(nauticalIdOf(undefined)).toBeNull();
  });
  it('los tipos que escribe la consulta en vivo son los del selector', async () => {
    const { nauticalIdOf } = await import('./nautical');
    expect(nauticalIdOf(nauticalType({ leisure: 'marina' }))).toBe('marina');
    expect(nauticalIdOf(nauticalType({ mooring: 'buoy' }))).toBe('mooring');
    expect(nauticalIdOf(nauticalType({ man_made: 'pier', name: 'x' }))).toBe('pier');
    expect(nauticalIdOf(nauticalType({ waterway: 'fuel' }))).toBe('fuel');
  });
});

describe('textos de tipo en el generador de datos', () => {
  it('tools/services-data/build.mjs escribe los mismos textos que usa el selector', async () => {
    const { readFileSync } = await import('node:fs');
    const { NAUTICAL_IDS, NAUTICAL_LABEL } = await import('./nautical');
    const source = readFileSync(new URL('../../../../tools/services-data/build.mjs', import.meta.url), 'utf8');
    for (const id of NAUTICAL_IDS) expect(source, NAUTICAL_LABEL[id]).toContain(`'${NAUTICAL_LABEL[id]}'`);
  });
});

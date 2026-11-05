import { describe, expect, it } from 'vitest';
import { TileType } from 'pmtiles';
import { classify, storedName } from './imported';

describe('mapas importados', () => {
  it('acepta un mapa con el esquema OpenMapTiles (OpenFreeMap, Planetiler)', () => {
    expect(classify({ tileType: TileType.Mvt }, { vector_layers: [{ id: 'water' }, { id: 'transportation' }] })).toBe('vector');
    expect(classify({ tileType: TileType.Mvt }, { vector_layers: [{ id: 'place' }] })).toBe('vector');
  });

  it('rechaza un mapa con otro esquema (Protomaps): el estilo no lo sabe dibujar', () => {
    expect(classify({ tileType: TileType.Mvt }, { vector_layers: [{ id: 'earth' }, { id: 'water' }, { id: 'roads' }, { id: 'places' }] })).toBe('unknownSchema');
    expect(classify({ tileType: TileType.Mvt }, null)).toBe('unknownSchema');
  });

  it('la elevación tiene que ser Terrarium', () => {
    expect(classify({ tileType: TileType.Png }, {})).toBe('elevation');
    expect(classify({ tileType: TileType.Webp }, { encoding: 'terrarium' })).toBe('elevation');
    expect(classify({ tileType: TileType.Png }, { encoding: 'mapbox' })).toBe('mapboxTerrain');
    expect(classify({ tileType: TileType.Jpeg }, {})).toBe('unsupportedType');
  });

  it('guarda el archivo con un nombre válido', () => {
    expect(storedName('argentina.pmtiles')).toBe('argentina.pmtiles');
    expect(storedName('a/b\\c.pmtiles')).toBe('a_b_c.pmtiles');
    expect(storedName('  ')).toBe('mapa.pmtiles');
  });
});

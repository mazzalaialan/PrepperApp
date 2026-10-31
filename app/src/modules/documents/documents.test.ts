import { describe, expect, it } from 'vitest';
import { parseTags } from './DocumentEditPage';

describe('parseTags', () => {
  it('separa por comas, recorta y descarta vacías y repetidas', () => {
    expect(parseTags(' dni, Familia , ,viaje,dni')).toEqual(['dni', 'Familia', 'viaje']);
  });

  it('texto vacío → sin etiquetas', () => {
    expect(parseTags('  ')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { KNOT_BY_ID } from './knots';
import { firstMatch, fold, isKnotBook, knotTerms } from './libraryRefs';

const book = (over: Partial<Parameters<typeof isKnotBook>[0]>) => ({
  id: 'x',
  sha256: '',
  title: 'Libro',
  categoryId: 'cultivo',
  license: 'public' as const,
  bytes: 0,
  installedAt: '',
  chapters: [],
  ...over,
});

describe('referencias de nudos en la biblioteca', () => {
  it('busca por los nombres específicos, sin paréntesis ni palabras sueltas', () => {
    const terms = knotTerms(KNOT_BY_ID.get('corredizo')!);
    expect(terms).toContain('nudo corredizo');
    expect(terms).toContain('lazo corredizo');
    expect(terms).not.toContain('lazo');
    expect(knotTerms(KNOT_BY_ID.get('as-de-guia')!)).toEqual(expect.arrayContaining(['as de guia', 'bowline']));
  });

  it('palabra completa y número de Ashley', () => {
    const text = fold('Los prusiks no son esto. El nudo Prusik sirve para subir.');
    expect(firstMatch(text, ['prusik'])!.at).toBe(text.indexOf('prusik sirve'));
    expect(firstMatch(fold('Ver el BOWLINE (ABOK #1010) en la página'), ['zzzz'], 1010)!.term).toBe('abok #1010');
    expect(firstMatch(fold('texto\n1010. The BOWLINE is'), ['zzzz'], 1010)).not.toBeNull();
    expect(firstMatch(fold('pág. 11010. nada'), ['zzzz'], 1010)).toBeNull();
  });

  it('libros de nudos: la categoría Cabuyería o el título', () => {
    expect(isKnotBook(book({ categoryId: 'cabuyeria' }))).toBe(true);
    expect(isKnotBook(book({ title: 'The Ashley Book of Knots' }))).toBe(true);
    expect(isKnotBook(book({ title: 'Manual de nudos' }))).toBe(true);
    expect(isKnotBook(book({ title: 'Huerta orgánica' }))).toBe(false);
  });
});

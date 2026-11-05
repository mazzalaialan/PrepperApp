import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkKey, deriveLibraryKey, LibraryError, openSealed, type LibraryCatalog } from './books';
import fixture from './fixtures/sealed.json';

/** El archivo lo cifró el conversor (Python, tools/library-builder): la app lo tiene que abrir igual. */
const catalog = { generatedAt: '', categories: [], privateAvailable: true, encryption: fixture.encryption } as LibraryCatalog;
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

describe('biblioteca: libros con derechos cifrados', () => {
  it('con la clave correcta: la prueba de clave da bien y el libro se abre', async () => {
    const key = await deriveLibraryKey('VikArg-prueba', catalog.encryption!);
    expect(await checkKey(key, catalog)).toBe(true);
    const files = unzipSync(await openSealed(key, bytes(fixture.book)));
    expect(strFromU8(files['index.html']!)).toContain('Libro de prueba');
    expect(strFromU8(files['text.txt']!)).toContain('Machard');
  });

  it('con otra clave: no se abre', async () => {
    const key = await deriveLibraryKey('otra', catalog.encryption!);
    expect(await checkKey(key, catalog)).toBe(false);
    await expect(openSealed(key, bytes(fixture.book))).rejects.toEqual(new LibraryError('bad-key'));
  });

  it('un ZIP sin cifrar no pasa por libro cifrado', async () => {
    const key = await deriveLibraryKey('VikArg-prueba', catalog.encryption!);
    await expect(openSealed(key, new TextEncoder().encode('PK\u0003\u0004…'))).rejects.toEqual(new LibraryError('corrupt'));
  });
});

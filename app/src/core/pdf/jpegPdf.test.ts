import { describe, expect, it } from 'vitest';
import { jpegPagePdf } from './jpegPdf';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
// Un JPEG mínimo no hace falta que sea válido para probar la estructura del PDF.
const FAKE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);

describe('PDF de una página con un JPEG', () => {
  const pdf = jpegPagePdf({ jpeg: FAKE_JPEG, widthPx: 2480, heightPx: 3508, title: 'Refugio López · Bariloche' });
  const text = latin1(pdf);

  it('empieza y termina como un PDF', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('la página es A4 (595,28 × 841,89 pt) y la imagen la cubre', () => {
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(text).toContain('/Width 2480 /Height 3508');
    expect(text).toContain('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q');
  });

  it('el JPEG va intacto y su largo está declarado', () => {
    const at = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 'stream\n'.length;
    expect(Array.from(pdf.slice(at, at + FAKE_JPEG.length))).toEqual(Array.from(FAKE_JPEG));
    expect(text).toContain(`/Length ${FAKE_JPEG.length} >>`);
  });

  it('la tabla de referencias cruzadas apunta a cada objeto', () => {
    const start = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(6);
    entries.forEach((off, i) => expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('el título con acentos va en UTF-16 hexadecimal', () => {
    expect(text).toMatch(/\/Title <FEFF[0-9a-f]+>/);
    expect(text).toContain('00f3'); // la «ó»
  });
});

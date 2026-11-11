/**
 * Escritor mínimo de PDF, sin librerías: una página con una imagen JPEG que la cubre entera
 * (para imprimir el mapa topográfico a 300 puntos por pulgada). El texto va dentro de la imagen.
 */
const MM_TO_PT = 72 / 25.4;
const enc = new TextEncoder();

/** Título en UTF-16BE hexadecimal (admite acentos). */
function pdfText(s: string): string {
  let hex = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
    for (const u of units) hex += u.toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
}

export interface JpegPage {
  /** Bytes del JPEG (RGB). */
  jpeg: Uint8Array;
  /** Tamaño de la imagen en píxeles. */
  widthPx: number;
  heightPx: number;
}

export interface JpegPdfInput {
  /** Una página por imagen, en orden. */
  pages: JpegPage[];
  /** Tamaño de las páginas en milímetros (por defecto A4 vertical). */
  pageWmm?: number;
  pageHmm?: number;
  title?: string;
}

/** PDF de una o más páginas; cada una es una imagen JPEG que la cubre entera. */
export function jpegPagePdf({ pages, pageWmm = 210, pageHmm = 297, title = '' }: JpegPdfInput): Uint8Array {
  const w = +(pageWmm * MM_TO_PT).toFixed(2);
  const h = +(pageHmm * MM_TO_PT).toFixed(2);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('endobj\n');
  };
  // Objetos: 1 catálogo, 2 árbol de páginas, 3 información, y por cada página: página, imagen y contenido.
  const n = pages.length;
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>\n'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ')}] /Count ${n} >>\n`));
  obj(3, () => push(`<< /Title ${pdfText(title)} /Producer ${pdfText('VikArg')} >>\n`));
  pages.forEach((pg, i) => {
    const page = 4 + i * 3;
    obj(page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>\n`));
    obj(page + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${pg.widthPx} /Height ${pg.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
      push(pg.jpeg);
      push('\nendstream\n');
    });
    obj(page + 2, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`));
  });
  const count = 4 + n * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

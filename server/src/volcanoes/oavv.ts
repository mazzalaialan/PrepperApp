import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/**
 * Nivel de alerta técnica de los volcanes: Observatorio Argentino de
 * Vigilancia Volcánica (OAVV, SEGEMAR). Su página lista los volcanes con
 * alerta distinta de verde (de Argentina y de la frontera con Chile, con los
 * reportes de OVDAS/SERNAGEOMIN por el acuerdo binacional) y muestra el nivel
 * como una imagen de semáforo: se lee el color de la franja de arriba.
 * SERNAGEOMIN no responde desde este servidor; el OAVV ya incluye los de la
 * frontera.
 */

export type VolcanoLevel = 'green' | 'yellow' | 'orange' | 'red';

export interface VolcanoAlert {
  /** Nombre como lo publica el OAVV ("VOLCÁN VILLARRICA"). */
  name: string;
  country: string;
  level: VolcanoLevel;
  lat: number;
  lon: number;
  /** Último reporte (PDF del OAVV) o la página del organismo. */
  report: string;
  /** OAVV (Argentina y frontera con Chile) o CENVUL (Perú). */
  source: 'OAVV' | 'CENVUL';
}

const BASE = 'https://oavv.segemar.gob.ar';
export const OAVV_LIST = `${BASE}/scripts/show_volcanes_alerta.php`;
const UA = { 'user-agent': 'VikArg (servidor propio; alertas volcánicas)' };

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\b(cv|c\.v|complejo volcanico|volcan|volcanico|cordon|caldera|cerro|nevado|nevados del?)\b\.?/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface Known {
  name: string;
  lat: number;
  lon: number;
}

let known: Known[] | null = null;
function volcanoes(): Known[] {
  known ??= (JSON.parse(readFileSync(new URL('./volcanoes.json', import.meta.url), 'utf8')) as { volcanoes: Known[] }).volcanoes;
  return known;
}

/** Ubicación por nombre (Smithsonian): "CV. NEVADOS DE CHILLÁN" → Nevados de Chillán. */
export function locate(name: string): Known | null {
  const f = fold(name);
  if (!f) return null;
  return volcanoes().find((v) => fold(v.name) === f) ?? volcanoes().find((v) => fold(v.name).includes(f) || f.includes(fold(v.name))) ?? null;
}

/** Tarjetas de la página: id, nombre y país de cada volcán con alerta. */
export function parseList(html: string): { id: string; name: string; country: string }[] {
  return [...html.matchAll(/<div class="volcano-card">([\s\S]*?)<img[^>]*class="volcano-alert"/g)].flatMap((m) => {
    const card = m[1]!;
    const id = card.match(/id_volcan=(\d+)/)?.[1];
    const name = card.match(/class="volcano-name">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1];
    const country = card.match(/class="volcano-country">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1];
    if (!id || !name) return [];
    const clean = (s: string) => s.replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
    return [{ id, name: clean(name), country: clean(country ?? '') }];
  });
}

// ---------- PNG mínimo: solo para leer un píxel ----------

/** Color RGB de un píxel de un PNG de 8 bits por canal, RGB o RGBA, sin entrelazar. */
export function pngPixel(png: Buffer, x: number, y: number): [number, number, number] | null {
  if (png.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      if (depth !== 8 || data[12] !== 0 || (color !== 2 && color !== 6)) return null;
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!width || x >= width || y >= height) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let prev = Buffer.alloc(stride);
  for (let row = 0; row <= y; row++) {
    const filter = raw[row * (stride + 1)]!;
    const line = Buffer.from(raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let v = line[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    prev = line;
  }
  return [prev[x * channels]!, prev[x * channels + 1]!, prev[x * channels + 2]!];
}

/** Color de la franja del semáforo → nivel (el más parecido). */
export function levelOf([r, g, b]: [number, number, number]): VolcanoLevel {
  const ref: [VolcanoLevel, number, number, number][] = [
    ['green', 136, 200, 110],
    ['yellow', 255, 222, 64],
    ['orange', 255, 150, 60],
    ['red', 240, 40, 45],
  ];
  return ref.reduce((best, [lvl, R, G, B]) => {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    return d < best.d ? { lvl, d } : best;
  }, { lvl: 'green' as VolcanoLevel, d: Infinity }).lvl;
}

export async function fetchVolcanoAlerts(fetchImpl: typeof fetch = fetch): Promise<VolcanoAlert[]> {
  const res = await fetchImpl(OAVV_LIST, { signal: AbortSignal.timeout(30_000), headers: UA });
  if (!res.ok) throw new Error(`OAVV: ${res.status}`);
  const out: VolcanoAlert[] = [];
  for (const v of parseList(await res.text())) {
    const at = locate(v.name);
    if (!at) continue;
    const img = await fetchImpl(`${BASE}/scripts/show_alerta.php?id=${v.id}&h=0`, { signal: AbortSignal.timeout(30_000), headers: UA });
    if (!img.ok) continue;
    const png = Buffer.from(await img.arrayBuffer());
    // La franja con el nombre del nivel ocupa el primer tercio: se lee arriba a la izquierda, fuera del texto.
    const px = pngPixel(png, 20, 20);
    if (!px) continue;
    out.push({ name: v.name, country: v.country, level: levelOf(px), lat: at.lat, lon: at.lon, report: `${BASE}/scripts/show_reporte.php?id_volcan=${v.id}`, source: 'OAVV' });
  }
  return out;
}

/** Hasta dónde se avisa según el nivel (caída de ceniza, lahares, cierre de rutas). */
export const volcanoRadiusKm = (level: VolcanoLevel) => ({ green: 0, yellow: 30, orange: 100, red: 300 })[level];
export const volcanoRank = (level: VolcanoLevel) => ({ green: 0, yellow: 1, orange: 2, red: 3 })[level];

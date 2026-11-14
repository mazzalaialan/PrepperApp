import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Niveles diarios de los ríos y del lago Titicaca de Bolivia (SENAMHI Bolivia, «Reporte de niveles diarios»): se publican como un PDF por
 * día hábil (https://senamhi.gob.bo/hidrologia/rhidrologico). El servidor busca el último, lee su tabla y la guarda unas horas; la app lo
 * pide con `GET /api/rivers/bo`. Sin licencia declarada («Derechos Reservados»): se usa citando al SENAMHI y mostrando la fecha de cada lectura.
 */
export interface BoRow {
  /** Estación y río tal como los escribe el PDF, juntos: «PUENTE CHAUNACA RAVELO». */
  key: string;
  prevDate: string;
  prevCm: number;
  lastDate: string;
  lastCm: number;
  /** Nivel cero de barranco (cm), si lo trae. */
  zeroCm: number | null;
  trend: 'rising' | 'falling' | 'steady';
}

export interface BoReading {
  station: string;
  river: string;
  prevDate: string;
  prevCm: number;
  /** Fecha de la última lectura (AAAA-MM-DD) y su valor en centímetros sobre la escala. */
  lastDate: string;
  lastCm: number;
  zeroCm: number | null;
  trend: BoRow['trend'];
}

export interface BoLevels {
  /** Fecha del reporte (AAAA-MM-DD). */
  reportDate: string;
  /** Cuándo lo leyó el servidor (ms). */
  fetchedAt: number;
  url: string;
  readings: BoReading[];
}

const LIST_URL = 'https://senamhi.gob.bo/hidrologia/rhidrologico';
const UA = 'VikArg-Survival-Tools/1.0';
const MAX_PDF = 5 * 1024 * 1024;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const TREND: Record<string, BoRow['trend']> = { ASCENSO: 'rising', DESCENSO: 'falling', 'SE MANTIENE': 'steady' };
// «ESTACIÓN RÍO 3/11/2026 101 4/11/2026 101 - SE MANTIENE»: dos lecturas (anterior y última) y el nivel cero de barranco (- si no tiene).
const ROW = /^(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d+)\s+(?:(-|\d+)\s+)?(SE MANTIENE|ASCENSO|DESCENSO)\s*$/;

/** «11/11/2026» → «2026-11-11». */
export function isoDate(d: string): string {
  const [day, month, year] = d.split('/').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Las filas de la tabla del texto del PDF (una por línea). */
export function parseNiveles(text: string): BoRow[] {
  const rows: BoRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ROW.exec(line.trim().replace(/\s+/g, ' '));
    if (!m) continue;
    rows.push({
      key: m[1]!.trim(),
      prevDate: isoDate(m[2]!),
      prevCm: Number(m[3]),
      lastDate: isoDate(m[4]!),
      lastCm: Number(m[5]),
      zeroCm: m[6] && m[6] !== '-' ? Number(m[6]) : null,
      trend: TREND[m[7]!]!,
    });
  }
  return rows;
}

/** «Jueves, 12 de noviembre de 2026» → «2026-11-12» (null si no está). */
export function reportDateOf(text: string): string | null {
  const m = /(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(text);
  const month = m ? MONTHS.indexOf(m[2]!.toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` : null;
}

/** El enlace al reporte más nuevo de la página de listados (los nombres traen la fecha: REPORTE_DE_NIVELES_12112026_SENAMHI.pdf). */
export function latestReportUrl(html: string): string | null {
  const links = [...html.matchAll(/href="([^"]*REPORTE_DE_NIVELES_(\d{2})(\d{2})(\d{4})_SENAMHI\.pdf)"/gi)].map((m) => ({ url: m[1]!, key: `${m[4]}${m[3]}${m[2]}` }));
  links.sort((a, b) => b.key.localeCompare(a.key));
  return links[0] ? new URL(links[0].url, LIST_URL).href : null;
}

export interface BoStation {
  name: string;
}

/** Une cada fila con una estación del catálogo: el texto de la fila empieza con el nombre de la estación y el resto es el río. */
export function matchReadings(rows: BoRow[], stations: BoStation[]): BoReading[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const known = stations.map((s) => ({ name: s.name, key: norm(s.name) })).sort((a, b) => b.key.length - a.key.length);
  const out: BoReading[] = [];
  for (const r of rows) {
    // «RIBERALTA-SNHN BENI»: el sufijo es de quien opera la estación (Hidrografía Naval), no parte del nombre.
    const orig = r.key.replace(/-SNHN/i, '');
    const key = norm(orig);
    const st = known.find((s) => key === s.key || key.startsWith(`${s.key} `));
    if (!st) continue;
    out.push({ station: st.name, river: orig.trim().slice(st.key.length).trim(), prevDate: r.prevDate, prevCm: r.prevCm, lastDate: r.lastDate, lastCm: r.lastCm, zeroCm: r.zeroCm, trend: r.trend });
  }
  return out;
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`SENAMHI Bolivia ${res.status}`);
  return res;
}

/** Texto de un PDF (una página por línea de la tabla). */
export async function pdfText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  return (await extractText(pdf, { mergePages: true })).text;
}

/** Baja el último reporte y lo lee. `stations` limita a las que se conocen (con coordenadas). */
export async function fetchBoLevels(stations: BoStation[], now = Date.now()): Promise<BoLevels> {
  const url = latestReportUrl(await (await get(LIST_URL)).text());
  if (!url) throw new Error('SENAMHI Bolivia: no se encontró el reporte de niveles');
  const res = await get(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_PDF) throw new Error('SENAMHI Bolivia: el PDF es demasiado grande');
  const text = await pdfText(buf);
  const readings = matchReadings(parseNiveles(text), stations);
  const reportDate = reportDateOf(text);
  if (!reportDate || readings.length < 5) throw new Error('SENAMHI Bolivia: el PDF cambió de formato');
  return { reportDate, fetchedAt: now, url, readings };
}

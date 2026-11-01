import { strFromU8, strToU8 } from 'fflate';
import { blobStore } from '@/core/db/repository';
import type { Country } from '@/core/settings/settings';
import { loadCountryData } from './country';
import { loadPlaceFinder, type PlaceFinder } from './places';

/**
 * Repetidoras de radioaficionados importadas por el usuario desde un archivo
 * que exportó para uso personal (RepeaterBook: CSV, GPX o KML con
 * coordenadas; o CSV de CHIRP). No se incluyen en la app: las condiciones de
 * RepeaterBook no permiten redistribuirlas.
 */

export interface Repeater {
  /** Indicativo o nombre. */
  call: string;
  /** Localidad o descripción del lugar. */
  location: string;
  /** Frecuencia de salida (la que se escucha), en MHz. */
  output: number;
  /** Desplazamiento en MHz (negativo o positivo), si se conoce. */
  offset: number | null;
  /** Subtono de subida (CTCSS), en Hz. */
  tone: number | null;
  mode: string;
  /** Estado según la fuente ("On-Air", "Off-Air", …). */
  status: string;
  lat: number | null;
  lon: number | null;
  /** País o estado según la fuente (RepeaterBook pone "Argentina" en "State"). */
  region?: string;
  /**
   * Ubicación estimada por el nombre de la localidad (archivos sin coordenadas):
   * "Avellaneda, Buenos Aires". `null` = se buscó y no se encontró.
   */
  approx?: string | null;
}

export interface RepeaterList {
  importedAt: string;
  /** Nombre del archivo, para recordar de dónde salió. */
  source: string;
  items: Repeater[];
}

const BLOB_ID = 'repeaters';

export async function loadRepeaters(): Promise<RepeaterList | null> {
  const bytes = await blobStore.get(BLOB_ID);
  if (!bytes) return null;
  try {
    return JSON.parse(strFromU8(bytes)) as RepeaterList;
  } catch {
    return null;
  }
}

export async function saveRepeaters(list: RepeaterList | null): Promise<void> {
  if (!list) await blobStore.remove(BLOB_ID);
  else await blobStore.put(BLOB_ID, strToU8(JSON.stringify(list)) as Uint8Array<ArrayBuffer>);
}

/** Las nuevas reemplazan a las que tengan la misma frecuencia e indicativo; el resto se suma. */
export function mergeRepeaters(current: Repeater[], incoming: Repeater[]): Repeater[] {
  const key = (r: Repeater) => `${r.call.toUpperCase()}|${r.output.toFixed(4)}`;
  const map = new Map(current.map((r) => [key(r), r]));
  for (const r of incoming) map.set(key(r), r);
  return [...map.values()];
}

// ---------- Lectura de archivos ----------

const num = (s: string | undefined | null): number | null => {
  if (s == null) return null;
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) && String(s).trim() !== '' ? n : null;
};

/** Frecuencias de radioaficionados en VHF/UHF (y 6 m y 10 m): descarta columnas que no son frecuencias. */
const isFrequency = (n: number | null): n is number => n !== null && n >= 28 && n <= 1300;

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

/** Encuentra la columna por cualquiera de sus nombres posibles (RepeaterBook, CHIRP y variantes). */
function column(headers: string[], ...names: string[]): number {
  const n = headers.map(norm);
  for (const name of names) {
    const i = n.indexOf(norm(name));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseRepeaterCsv(text: string): Repeater[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = splitCsvLine(lines[0]!, sep);
  const c = {
    output: column(headers, 'Output Freq', 'Output Frequency', 'Frequency', 'Freq', 'Output'),
    input: column(headers, 'Input Freq', 'Input Frequency', 'Input'),
    offset: column(headers, 'Offset'),
    duplex: column(headers, 'Duplex'),
    tone: column(headers, 'Uplink Tone', 'PL', 'CTCSS', 'rToneFreq', 'Tone Freq', 'Access Tone', 'Tone'),
    toneMode: column(headers, 'Tone'),
    call: column(headers, 'Call', 'Callsign', 'Call Sign', 'Name'),
    location: column(headers, 'Location', 'Nearest City', 'City', 'Landmark', 'Comment'),
    lat: column(headers, 'Lat', 'Latitude'),
    lon: column(headers, 'Long', 'Lon', 'Lng', 'Longitude'),
    mode: column(headers, 'Mode', 'Modes'),
    status: column(headers, 'Op Status', 'Operational Status', 'Status', 'Use'),
    comment: column(headers, 'Comment', 'Notes'),
    region: column(headers, 'State', 'Country', 'Province'),
  };
  if (c.output < 0) return [];
  const out: Repeater[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line, sep);
    const get = (i: number) => (i >= 0 ? (f[i] ?? '') : '');
    const output = num(get(c.output));
    if (!isFrequency(output)) continue;
    let offset = num(get(c.offset));
    const input = num(get(c.input));
    // CHIRP: el desplazamiento va sin signo y el sentido en "Duplex" (+ / -).
    const duplex = get(c.duplex);
    if (offset !== null && duplex === '-') offset = -Math.abs(offset);
    if (offset !== null && duplex === '') offset = null;
    if (offset === null && isFrequency(input) && input !== output) offset = Math.round((input - output) * 1e4) / 1e4;
    // En CHIRP "Tone" es el modo de tono; el valor viene en rToneFreq. Solo vale si es un número.
    const toneValue = num(get(c.tone));
    const tone = toneValue !== null && toneValue > 60 && toneValue < 260 ? toneValue : null;
    const toneMode = get(c.toneMode);
    const lat = num(get(c.lat));
    const lon = num(get(c.lon));
    // En CHIRP "Location" es el número de memoria del equipo, no un lugar.
    const placeText = /^\d+$/.test(get(c.location)) ? '' : get(c.location);
    const location = placeText || get(c.comment);
    out.push({
      call: get(c.call) || location || output.toFixed(3),
      location: location !== get(c.call) ? location : '',
      output,
      offset,
      // CHIRP sin tono ("" o "None"): no se informa aunque haya un valor por defecto en rToneFreq.
      tone: c.toneMode >= 0 && c.toneMode !== c.tone && !/^(tone|tsql)$/i.test(toneMode) ? null : tone,
      mode: get(c.mode),
      status: get(c.status),
      lat: lat !== null && Math.abs(lat) <= 90 && lat !== 0 ? lat : null,
      lon: lon !== null && Math.abs(lon) <= 180 && lon !== 0 ? lon : null,
      ...(get(c.region) && { region: get(c.region) }),
    });
  }
  return out;
}

/** País de una repetidora según la región que trae el archivo (RepeaterBook pone el país en "State"). */
const regionCountry = (region = ''): Country | null => (/chile/i.test(region) ? 'CL' : /uruguay/i.test(region) ? 'UY' : null);

/**
 * Las que vienen sin coordenadas se ubican en el centro de su localidad: Argentina
 * con el nomenclátor incluido; Chile y Uruguay con el paquete del país (si no se
 * pudo bajar, quedan para la próxima). Devuelve null si no cambió nada.
 */
export async function locateRepeaters(items: Repeater[]): Promise<Repeater[] | null> {
  const pending = items.filter((r) => r.lat === null && r.approx === undefined);
  if (pending.length === 0) return null;
  const finders = new Map<Country, PlaceFinder | null>();
  for (const r of pending) {
    const c = regionCountry(r.region) ?? 'AR';
    if (!finders.has(c)) finders.set(c, c === 'AR' ? await loadPlaceFinder() : ((await loadCountryData(c).catch(() => null))?.places ?? null));
  }
  let changed = false;
  const out = items.map((r) => {
    if (!pending.includes(r)) return r;
    const c = regionCountry(r.region);
    const places = finders.get(c ?? 'AR');
    if (!places) return r;
    changed = true;
    // La región (provincia, si la trae) ayuda a desempatar localidades con el mismo nombre.
    const covered = c !== null || places.covers(r.region ?? '');
    const m = r.location && covered ? places.find([r.location, c ? '' : r.region].filter((s) => s && !/^argentina$/i.test(s)).join(', ')) : null;
    return m ? { ...r, lat: m.lat, lon: m.lon, approx: m.label } : { ...r, approx: null };
  });
  return changed ? out : null;
}

/** Datos sueltos en el texto de un punto GPX/KML (p. ej. "146.970- PL 100.0 LU1ABC Rosario"). */
export function parseRepeaterText(name: string, desc: string, lat: number, lon: number): Repeater | null {
  const text = `${name} ${desc}`;
  const freqs = [...text.matchAll(/\b(\d{2,4}[.,]\d{2,5})\b/g)].map((m) => num(m[1]!)).filter(isFrequency);
  const output = freqs[0];
  if (output === undefined) return null;
  const sign = text.match(new RegExp(`${String(output).replace('.', '[.,]')}0*\\s*([+-])`))?.[1];
  const offsetMatch = text.match(/offset[:\s]*([+-]?\d+[.,]?\d*)/i);
  let offset = offsetMatch ? num(offsetMatch[1]!) : null;
  if (offset === null && freqs[1] !== undefined && freqs[1] !== output) offset = Math.round((freqs[1] - output) * 1e4) / 1e4;
  if (offset === null && sign) offset = sign === '-' ? (output < 300 ? -0.6 : -5) : output < 300 ? 0.6 : 5;
  const toneMatch = text.match(/(?:PL|CTCSS|tone|tono|T)\s*[:=]?\s*(\d{2,3}[.,]\d)/i);
  const callMatch = text.match(/\b([A-Z]{1,2}\d[A-Z]{1,4})\b/);
  return {
    call: callMatch?.[1] ?? name.trim(),
    location: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
    output,
    offset,
    tone: toneMatch ? num(toneMatch[1]!) : null,
    mode: /dmr/i.test(text) ? 'DMR' : /fusion|c4fm/i.test(text) ? 'C4FM' : /d-?star/i.test(text) ? 'D-STAR' : '',
    status: /off[- ]?air|fuera de servicio/i.test(text) ? 'Off-Air' : '',
    lat,
    lon,
  };
}

/** Texto de una etiqueta (sin CDATA ni entidades básicas). */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return (m?.[1] ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

const attr = (open: string, name: string) => Number(open.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);

export function parseRepeaterXml(text: string): Repeater[] {
  const out: Repeater[] = [];
  // GPX: <wpt lat lon><name/><desc/></wpt>
  for (const m of text.matchAll(/(<wpt\b[^>]*>)([\s\S]*?)<\/wpt>/gi)) {
    const r = parseRepeaterText(tag(m[2]!, 'name'), `${tag(m[2]!, 'desc')} ${tag(m[2]!, 'cmt')}`, attr(m[1]!, 'lat'), attr(m[1]!, 'lon'));
    if (r && Number.isFinite(r.lat) && Number.isFinite(r.lon)) out.push(r);
  }
  // KML: <Placemark><name/><description/><Point><coordinates>lon,lat</coordinates></Point></Placemark>
  for (const m of text.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)) {
    const [lon, lat] = tag(m[1]!, 'coordinates').trim().split(/\s+/)[0]!.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const r = parseRepeaterText(tag(m[1]!, 'name'), tag(m[1]!, 'description'), lat!, lon!);
    if (r) out.push(r);
  }
  return out;
}

export function parseRepeaterFile(name: string, text: string): Repeater[] {
  return /\.(gpx|kml|xml)$/i.test(name) || text.trimStart().startsWith('<') ? parseRepeaterXml(text) : parseRepeaterCsv(text);
}

/** Para programar el equipo: "146,970 MHz −0,6 · T 100,0". */
export function repeaterSummary(r: Repeater, locale: string): string {
  const f = (n: number, d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const parts = [`${f(r.output, 3)} MHz`];
  if (r.offset) parts.push(`${r.offset > 0 ? '+' : '−'}${f(Math.abs(r.offset), Math.abs(r.offset) < 1 ? 1 : 0)}`);
  if (r.tone) parts.push(`T ${f(r.tone, 1)}`);
  return parts.join(' · ');
}

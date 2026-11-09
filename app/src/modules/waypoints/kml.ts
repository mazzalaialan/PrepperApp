import { strFromU8, unzipSync } from 'fflate';
import type { TrackPoint } from '@/modules/tracks/gpx';

/**
 * Lectura y escritura de KML (Google Earth, Google Maps y muchas apps de mapas)
 * y de KMZ (el mismo KML comprimido en un zip). Se lee con expresiones
 * regulares, como el GPX, para que ande igual en el navegador y en las pruebas.
 */

export class KmlError extends Error {
  constructor(public readonly code: 'not-kml' | 'empty') {
    super(code);
    this.name = 'KmlError';
  }
}

export interface KmlPoint {
  name: string;
  lat: number;
  lon: number;
  ele: number | null;
  desc: string;
}

export interface ParsedKml {
  name: string;
  /** Recorridos: líneas (LineString) y tracks de Google Earth (gx:Track). */
  segments: TrackPoint[][];
  /** Puntos con nombre (Placemark con Point). */
  points: KmlPoint[];
}

const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/**
 * Texto de una etiqueta dentro de un trozo de XML; '' si no está. Con `html`
 * (las descripciones, que suelen traer HTML) se sacan las etiquetas; en los
 * nombres no: son texto plano y pueden tener un "<" legítimo.
 */
function tag(xml: string, name: string, html = false): string {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  const text = unescapeXml(m[1]!);
  return (html ? text.replace(/<[^>]+>/g, ' ') : text).replace(/\s+/g, ' ').trim();
}

/** "lon,lat,alt lon,lat,alt …" (el formato de KML: primero la longitud). */
function parseCoordinates(text: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const tuple of text.trim().split(/\s+/)) {
    if (!tuple) continue;
    const [lon, lat, alt] = tuple.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat!) > 90 || Math.abs(lon!) > 180) continue;
    out.push([lat!, lon!, Number.isFinite(alt) ? alt! : null]);
  }
  return out;
}

/** Un track de Google Earth: <gx:coord>lon lat alt</gx:coord> (con <when> opcional). */
function parseGxTrack(xml: string): TrackPoint[] {
  const whens = [...xml.matchAll(/<when>([^<]*)<\/when>/gi)].map((m) => Date.parse(m[1]!));
  const out: TrackPoint[] = [];
  let i = 0;
  for (const m of xml.matchAll(/<gx:coord>([^<]*)<\/gx:coord>/gi)) {
    const [lon, lat, alt] = m[1]!.trim().split(/\s+/).map(Number);
    const when = whens[i++];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = Number.isFinite(alt) ? alt! : null;
    out.push(when !== undefined && Number.isFinite(when) ? [lat!, lon!, ele, Math.round(when / 1000)] : [lat!, lon!, ele]);
  }
  return out;
}

export function parseKml(text: string, fileName = ''): ParsedKml {
  if (!/<kml\b/i.test(text)) throw new KmlError('not-kml');
  const segments: TrackPoint[][] = [];
  const points: KmlPoint[] = [];
  for (const pm of text.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gi)) {
    const body = pm[0];
    const name = tag(body, 'name');
    let isLine = false;
    for (const ls of body.matchAll(/<LineString\b[\s\S]*?<\/LineString>/gi)) {
      const pts = parseCoordinates(tag(ls[0], 'coordinates'));
      if (pts.length > 1) segments.push(pts);
      isLine = true;
    }
    for (const gx of body.matchAll(/<gx:Track\b[\s\S]*?<\/gx:Track>/gi)) {
      const pts = parseGxTrack(gx[0]);
      if (pts.length > 1) segments.push(pts);
      isLine = true;
    }
    // El borde de un polígono también es una línea (por ejemplo, un circuito).
    for (const ring of body.matchAll(/<LinearRing\b[\s\S]*?<\/LinearRing>/gi)) {
      const pts = parseCoordinates(tag(ring[0], 'coordinates'));
      if (pts.length > 1) segments.push(pts);
      isLine = true;
    }
    if (!isLine) {
      const point = body.match(/<Point\b[\s\S]*?<\/Point>/i);
      const p = point ? parseCoordinates(tag(point[0], 'coordinates'))[0] : undefined;
      if (p) points.push({ name: name || '—', lat: p[0], lon: p[1], ele: p[2], desc: tag(body, 'description', true) });
    }
  }
  if (segments.length === 0 && points.length === 0) throw new KmlError('empty');
  // El nombre: el del documento (antes del primer Placemark) o, si no, el del primer lugar o el del archivo.
  const head = text.split(/<Placemark\b/i)[0] ?? '';
  const docName = tag(head, 'name');
  const firstLine = text.match(/<Placemark\b[\s\S]*?<\/Placemark>/i)?.[0] ?? '';
  const name = docName || tag(firstLine, 'name') || fileName.replace(/\.(kml|kmz)$/i, '') || 'Ruta';
  return { name, segments, points };
}

/** Texto KML de un archivo .kml o .kmz (el zip de Google Earth, con doc.kml o el primer .kml que tenga). */
export function kmlTextFromBytes(bytes: Uint8Array): string {
  // Los zip empiezan con "PK".
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const names = Object.keys(files);
    const pick = names.find((n) => n.toLowerCase() === 'doc.kml') ?? names.find((n) => n.toLowerCase().endsWith('.kml'));
    if (!pick) throw new KmlError('not-kml');
    return strFromU8(files[pick]!);
  }
  return new TextDecoder().decode(bytes);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** KML con la ruta como una línea (y, si se dan, los puntos con nombre). */
export function toKml(name: string, line: { lat: number; lon: number; ele?: number | null }[], places: { name: string; lat: number; lon: number }[] = []): string {
  const coords = line.map((p) => `${p.lon},${p.lat},${p.ele ?? 0}`).join(' ');
  const marks = places.map((p) => `    <Placemark><name>${esc(p.name)}</name><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(name)}</name>
    <Placemark>
      <name>${esc(name)}</name>
      <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>
    </Placemark>
${marks}
  </Document>
</kml>
`;
}

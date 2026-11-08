import { distanceMeters } from '@/core/geo/geo';
import type { TrackWaypoint } from '@/core/model/types';

/**
 * Lectura de archivos GPX (Wikiloc, y cualquier app de rutas o GPS). Se leen
 * con expresiones regulares, como los de repetidoras: andan igual en el
 * navegador y en las pruebas, sin DOMParser.
 */

/** [lat, lon, altura o null] */
/** [lat, lon, altura o null, y, si se grabó con la app, la hora en segundos desde 1970]. */
export type TrackPoint = [number, number, number | null, number?];

export interface ParsedTrack {
  name: string;
  desc: string;
  /** Página de origen (Wikiloc pone el link a la ruta). */
  link: string | null;
  /** Segmentos del recorrido (un track puede venir cortado). */
  segments: TrackPoint[][];
  waypoints: TrackWaypoint[];
}

export interface TrackStats {
  distanceM: number;
  ascentM: number;
  descentM: number;
  minEle: number | null;
  maxEle: number | null;
}

/** Texto de una etiqueta, sin CDATA, entidades básicas ni HTML. */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return (m?.[1] ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const attr = (open: string, name: string): number => Number(open.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1]);

function points(xml: string, element: 'trkpt' | 'rtept'): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const m of xml.matchAll(new RegExp(`(<${element}\\b[^>]*?)(?:/>|>([\\s\\S]*?)</${element}>)`, 'gi'))) {
    const lat = attr(m[1]!, 'lat');
    const lon = attr(m[1]!, 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = Number(tag(m[2] ?? '', 'ele'));
    out.push([lat, lon, m[2] && Number.isFinite(ele) && tag(m[2], 'ele') !== '' ? ele : null]);
  }
  return out;
}

export class GpxError extends Error {
  constructor(public readonly code: 'not-gpx' | 'empty') {
    super(code);
    this.name = 'GpxError';
  }
}

export function parseGpx(text: string, fileName = ''): ParsedTrack {
  if (!/<gpx\b/i.test(text)) throw new GpxError('not-gpx');
  const metadata = text.match(/<metadata\b[\s\S]*?<\/metadata>/i)?.[0] ?? '';
  // El track, o la ruta (rte) si el archivo no trae track: de ahí salen nombre y descripción.
  const trk = text.match(/<trk\b[\s\S]*?<\/trk>/i)?.[0] ?? text.match(/<rte\b[\s\S]*?<\/rte>/i)?.[0] ?? '';
  const segments: TrackPoint[][] = [];
  for (const seg of text.matchAll(/<trkseg\b[\s\S]*?<\/trkseg>/gi)) {
    const pts = points(seg[0], 'trkpt');
    if (pts.length > 1) segments.push(pts);
  }
  // Algunas apps exportan rutas (rte) en vez de tracks.
  if (segments.length === 0) {
    for (const rte of text.matchAll(/<rte\b[\s\S]*?<\/rte>/gi)) {
      const pts = points(rte[0], 'rtept');
      if (pts.length > 1) segments.push(pts);
    }
  }
  const waypoints: TrackWaypoint[] = [];
  for (const m of text.matchAll(/(<wpt\b[^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/gi)) {
    const lat = attr(m[1]!, 'lat');
    const lon = attr(m[1]!, 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const body = m[2] ?? '';
    const ele = Number(tag(body, 'ele'));
    waypoints.push({ name: tag(body, 'name') || '—', lat, lon, ele: tag(body, 'ele') !== '' && Number.isFinite(ele) ? ele : null, desc: tag(body, 'desc') || tag(body, 'cmt') });
  }
  if (segments.length === 0 && waypoints.length === 0) throw new GpxError('empty');
  const link = (metadata.match(/<link\b[^>]*href=["']([^"']+)["']/i) ?? trk.match(/<link\b[^>]*href=["']([^"']+)["']/i))?.[1] ?? null;
  const name = tag(trk, 'name') || tag(metadata, 'name') || fileName.replace(/\.gpx$/i, '') || 'Track';
  return { name, desc: tag(trk, 'desc') || tag(metadata, 'desc'), link, segments, waypoints };
}

/**
 * Distancia y desnivel. El desnivel acumula solo cambios de más de 5 m, para
 * no sumar el ruido de la altura del GPS (como hacen Wikiloc y otras apps).
 */
export function trackStats(segments: TrackPoint[][]): TrackStats {
  let distanceM = 0;
  let ascentM = 0;
  let descentM = 0;
  let minEle: number | null = null;
  let maxEle: number | null = null;
  const THRESHOLD = 5;
  for (const seg of segments) {
    let ref: number | null = null;
    for (let i = 0; i < seg.length; i++) {
      const [lat, lon, ele] = seg[i]!;
      if (i > 0) distanceM += distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat, lon });
      if (ele === null) continue;
      minEle = minEle === null ? ele : Math.min(minEle, ele);
      maxEle = maxEle === null ? ele : Math.max(maxEle, ele);
      if (ref === null) ref = ele;
      else if (ele - ref >= THRESHOLD) {
        ascentM += ele - ref;
        ref = ele;
      } else if (ref - ele >= THRESHOLD) {
        descentM += ref - ele;
        ref = ele;
      }
    }
  }
  return { distanceM, ascentM: Math.round(ascentM), descentM: Math.round(descentM), minEle, maxEle };
}

/**
 * Cuánto se aparta p del segmento a–b (en grados escalados): de costado o en
 * altura, lo que sea mayor. Así una subida en línea recta conserva su perfil.
 */
function offset(p: TrackPoint, a: TrackPoint, b: TrackPoint, k: number): number {
  const ax = a[1] * k;
  const ay = a[0];
  const dx = b[1] * k - ax;
  const dy = b[0] - ay;
  const px = p[1] * k - ax;
  const py = p[0] - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
  const side = Math.hypot(px - t * dx, py - t * dy);
  if (p[2] === null || a[2] === null || b[2] === null) return side;
  const up = Math.abs(p[2] - (a[2] + t * (b[2] - a[2]))) / 111_320;
  return Math.max(side, up);
}

/**
 * Simplifica el recorrido (Douglas-Peucker) sin perder la forma: un track de
 * Wikiloc puede traer decenas de miles de puntos; a ~5 m de tolerancia queda
 * igual en el mapa y ocupa mucho menos.
 */
export function simplify(points: TrackPoint[], toleranceM = 5): TrackPoint[] {
  if (points.length < 3) return points;
  const k = Math.cos((points[0]![0] * Math.PI) / 180);
  const tol = toleranceM / 111_320;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = from + 1; i < to; i++) {
      const d = offset(points[i]!, points[from]!, points[to]!, k);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol) {
      keep[idx] = 1;
      stack.push([from, idx], [idx, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

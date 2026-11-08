import { distanceMeters } from '@/core/geo/geo';
import type { Outing, Track, Workout } from '@/core/model/types';
import { normalizeServerUrl } from '@/core/notifications/notifications';
import { simplify, type TrackPoint } from '@/modules/tracks/gpx';
import { inOuting, totalsOf } from './history';

/**
 * Compartir una salida con un enlace público (para redes sociales). Se sube
 * una copia chica: título, recorrido simplificado, totales y perfil de altura.
 * NUNCA fotos, notas, calorías de otras personas ni datos de salud. Por
 * privacidad, el recorrido se recorta al principio y al final (por defecto 300
 * m), para no mostrar de dónde se sale ni adónde se vuelve (la casa).
 */

export const DEFAULT_TRIM_M = 300;
const MAX_ROUTE_POINTS = 1200;
const MAX_PROFILE_POINTS = 300;

/** Saca los primeros y últimos `m` metros del recorrido completo (tramo por tramo). */
export function trimEnds(segments: TrackPoint[][], m: number): TrackPoint[][] {
  if (m <= 0) return segments.filter((s) => s.length > 1);
  const cut = (seg: TrackPoint[], metres: number): TrackPoint[] => {
    let acc = 0;
    for (let i = 1; i < seg.length; i++) {
      acc += distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat: seg[i]![0], lon: seg[i]![1] });
      if (acc >= metres) return seg.slice(i);
    }
    return [];
  };
  const segs = segments.filter((s) => s.length > 1).map((s) => [...s]);
  if (!segs.length) return [];
  // Al principio: del primer tramo, y si es más corto que el recorte, se sigue con el siguiente.
  let left = m;
  while (segs.length && left > 0) {
    const len = segs[0]!.slice(1).reduce((a, p, i) => a + distanceMeters({ lat: segs[0]![i]![0], lon: segs[0]![i]![1] }, { lat: p[0], lon: p[1] }), 0);
    if (len <= left) {
      left -= len;
      segs.shift();
    } else {
      segs[0] = cut(segs[0]!, left);
      left = 0;
    }
  }
  left = m;
  while (segs.length && left > 0) {
    const last = segs.at(-1)!;
    const len = last.slice(1).reduce((a, p, i) => a + distanceMeters({ lat: last[i]![0], lon: last[i]![1] }, { lat: p[0], lon: p[1] }), 0);
    if (len <= left) {
      left -= len;
      segs.pop();
    } else {
      segs[segs.length - 1] = cut([...last].reverse(), left).reverse();
      left = 0;
    }
  }
  return segs.filter((s) => s.length > 1);
}

/** Simplifica hasta que entren en el tope de puntos. */
function fit(segments: TrackPoint[][], max: number): TrackPoint[][] {
  let tol = 5;
  let out = segments;
  while (out.flat().length > max && tol < 2000) {
    tol *= 1.6;
    out = segments.map((s) => simplify(s, tol));
  }
  return out;
}

export interface SharePayload {
  name: string;
  lang: 'es' | 'en';
  date: string;
  kinds: string[];
  activities: number;
  distanceM: number;
  totalS: number;
  ascentM: number;
  descentM: number;
  calories: number | null;
  maxEle: number | null;
  minEle: number | null;
  route: [number, number][][];
  profile: [number, number][];
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function buildSharePayload(outing: Outing, all: Workout[], tracks: Map<string, Track>, lang: 'es' | 'en', trimM = DEFAULT_TRIM_M): SharePayload {
  const list = inOuting(all, outing.id);
  const totals = totalsOf(list);
  const raw: TrackPoint[][] = list.flatMap((w) => (w.trackId ? tracks.get(w.trackId)?.segments ?? [] : []));
  const trimmed = fit(trimEnds(raw, trimM), MAX_ROUTE_POINTS);
  // Perfil de altura con lo recortado (no se muestra la altura de la casa tampoco), por distancia acumulada.
  const profile: [number, number][] = [];
  let acc = 0;
  for (const seg of trimmed) {
    for (let i = 0; i < seg.length; i++) {
      if (i > 0) acc += distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat: seg[i]![0], lon: seg[i]![1] });
      if (seg[i]![2] !== null && seg[i]![2] !== undefined) profile.push([Math.round(acc), Math.round(seg[i]![2]!)]);
    }
  }
  const step = Math.max(1, Math.ceil(profile.length / MAX_PROFILE_POINTS));
  const sampled = profile.filter((_, i) => i % step === 0 || i === profile.length - 1);
  return {
    name: outing.name,
    lang,
    date: list[0] ? localDay(list[0].startedAt) : localDay(outing.createdAt),
    kinds: [...new Set(list.map((w) => w.kind))],
    activities: list.length,
    distanceM: Math.round(totals.distanceM),
    totalS: Math.round(totals.totalS),
    ascentM: totals.ascentM,
    descentM: totals.descentM,
    calories: totals.calories > 0 ? totals.calories : null,
    maxEle: totals.maxEle,
    minEle: totals.minEle,
    route: trimmed.map((s) => s.map((p) => [p[0], p[1]] as [number, number])),
    profile: sampled,
  };
}

export class ShareError extends Error {
  constructor(public readonly code: 'offline' | 'full' | 'too-many' | 'invalid' | 'failed') {
    super(code);
  }
}

/** Sube la salida al servidor y devuelve lo que hay que guardar (el enlace y el código de borrado). */
export async function shareOuting(serverUrl: string, payload: SharePayload): Promise<NonNullable<Outing['share']>> {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(`${base}/api/outings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
  if (!res) throw new ShareError('offline');
  if (res.status === 503) throw new ShareError('full');
  if (res.status === 429) throw new ShareError('too-many');
  if (res.status === 400) throw new ShareError('invalid');
  if (!res.ok) throw new ShareError('failed');
  const body = (await res.json()) as { id: string; path: string; deleteToken: string; expiresAt: string };
  return { id: body.id, url: `${base}${body.path}`, deleteToken: body.deleteToken, sharedAt: new Date().toISOString(), expiresAt: body.expiresAt };
}

/** Borra el enlace público. Si el servidor ya no lo tiene (venció o se borró), también cuenta como borrado. */
export async function unshareOuting(serverUrl: string, share: NonNullable<Outing['share']>): Promise<void> {
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/api/outings/${share.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${share.deleteToken}` } }).catch(() => null);
  if (!res) throw new ShareError('offline');
  if (!res.ok && res.status !== 401) throw new ShareError('failed');
}

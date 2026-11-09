import type { TrackPoint } from '@/modules/tracks/gpx';
import { splitByZones, type PrivateZone } from './share';

/** Lo que se manda al servidor del seguimiento en vivo (ver liveShare.ts). Va aparte para poder probarlo sin la grabadora. */
const CHUNK_MAX = 100;

export interface LiveUpdate {
  status: 'active' | 'paused';
  stats: { distanceM: number; elapsedS: number; ascentM: number; paceSPerKm: number; speedKmh: number };
  chunks: { newSegment: boolean; points: [number, number, number][] }[];
}

/**
 * Lo nuevo del recorrido desde lo último mandado, sin las zonas privadas. Cada
 * trozo es de un solo tramo; `newSegment` va cuando hay un corte (pantalla
 * apagada) o cuando se sacó un tramo por una zona privada.
 */
export function buildChunks(segments: TrackPoint[][], from: { seg: number; pt: number }, zones: PrivateZone[], nowS: number): { chunks: LiveUpdate['chunks']; next: { seg: number; pt: number } } {
  const chunks: LiveUpdate['chunks'] = [];
  let seg = from.seg;
  let pt = from.pt;
  let budget = CHUNK_MAX;
  const timed = (p: TrackPoint) => [p[0], p[1], p[3] ?? nowS] as [number, number, number];
  while (seg < segments.length && budget > 0) {
    const all = segments[seg]!;
    const take = all.slice(pt, pt + budget);
    if (take.length > 0) {
      // Se incluye el punto anterior como referencia: si entre él y el nuevo hay una zona privada, se corta ahí.
      const ctx = pt > 0 ? all[pt - 1]! : null;
      const pieces = splitByZones(ctx ? [ctx, ...take] : take, zones);
      pieces.forEach((piece, i) => {
        const continues = i === 0 && ctx !== null && piece[0] === ctx;
        const pts = continues ? piece.slice(1) : piece;
        if (pts.length > 0) chunks.push({ newSegment: !continues, points: pts.map(timed) });
      });
      pt += take.length;
      budget -= take.length;
    }
    if (pt >= all.length && seg < segments.length - 1) {
      seg += 1;
      pt = 0;
    } else break;
  }
  return { chunks, next: { seg, pt } };
}


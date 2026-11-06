import type { FastifyInstance } from 'fastify';
import type { OfficialAlert } from './cap.ts';
import type { VolcanoAlert } from '../volcanoes/oavv.ts';

/** Alertas oficiales vigentes que leyó el servidor (para el mapa de la app). */
export interface OfficialStore {
  alerts: OfficialAlert[];
  /** Volcanes con alerta técnica distinta de verde (OAVV). */
  volcanoes: VolcanoAlert[];
  updatedAt: number;
  /** Fuentes que fallaron en la última vuelta (la app avisa que puede faltar alguna). */
  failed: string[];
}

export const createOfficialStore = (): OfficialStore => ({ alerts: [], volcanoes: [], updatedAt: 0, failed: [] });

/** Douglas-Peucker sobre un anillo [lat, lon]; tolerancia en grados (~500 m). */
export function simplifyRing(ring: [number, number][], tol = 0.005): [number, number][] {
  if (ring.length <= 8) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  // Anillo cerrado: se parte en dos para que los extremos no coincidan.
  const mid = Math.floor(ring.length / 2);
  keep[mid] = 1;
  const stack: [number, number][] = [
    [0, mid],
    [mid, ring.length - 1],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ay, ax] = ring[a]!;
    const [by, bx] = ring[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (ring[i]![1] - ax) - dx * (ring[i]![0] - ay)) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return ring.filter((_, i) => keep[i]).map(([lat, lon]) => [r3(lat), r3(lon)]);
}

/**
 * GET /api/alerts: alertas oficiales vigentes (SMN, DMC, INUMET y SIGMET de
 * ceniza) con sus zonas simplificadas, y el nivel de los volcanes (OAVV). Sin token: son datos públicos de los organismos.
 */
export function officialRoutes(app: FastifyInstance, store: OfficialStore): void {
  app.get('/api/alerts', async (_req, reply) => {
    const now = Date.now();
    reply.header('cache-control', 'no-store');
    return {
      updatedAt: store.updatedAt ? new Date(store.updatedAt).toISOString() : null,
      failed: store.failed,
      volcanoes: store.volcanoes,
      alerts: store.alerts
        .filter((a) => Date.parse(a.expires) > now)
        .map((a) => ({ ...a, areas: a.areas.map((area) => ({ desc: area.desc, polygons: area.polygons.map((p) => simplifyRing(p)) })) })),
    };
  });
}

/**
 * Geometría de áreas protegidas para las herramientas de datos: armar
 * polígonos con los tramos de OpenStreetMap, simplificarlos y ubicarlos.
 * (Copiado de parks-cl.mjs; ese archivo todavía tiene su propia copia.)
 */

const key = (p) => `${p.lon},${p.lat}`;
/** Une los tramos (ways) de una relación en anillos cerrados. */
export function stitch(segments) {
  const rings = [];
  const pool = segments.filter((s) => s.length > 1).map((s) => s.map((p) => [p.lon, p.lat]));
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (key({ lon: ring[0][0], lat: ring[0][1] }) !== key({ lon: ring.at(-1)[0], lat: ring.at(-1)[1] }) && guard++ < 10000) {
      const end = ring.at(-1);
      const i = pool.findIndex((s) => (s[0][0] === end[0] && s[0][1] === end[1]) || (s.at(-1)[0] === end[0] && s.at(-1)[1] === end[1]));
      if (i < 0) break;
      const [s] = pool.splice(i, 1);
      ring = ring.concat((s[0][0] === end[0] && s[0][1] === end[1] ? s : s.reverse()).slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Punto dentro de un anillo [lon, lat]. */
export function inRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Elemento de OSM → polígonos [[borde, ...huecos]]. */
export function osmPolygons(e) {
  if (e.type === 'way') return [[e.geometry.map((p) => [p.lon, p.lat])]];
  const outers = stitch(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry));
  const inners = stitch(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => m.geometry));
  return outers.map((o) => [o, ...inners.filter((h) => inRing(o, h[0]))]);
}

// ---------- Simplificación (igual que parks.mjs) ----------
export const r4 = (n) => Math.round(n * 1e4) / 1e4;
export function simplify(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len;
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
  return points.filter((_, i) => keep[i]);
}
export const ringArea = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
export const simplifyRing = (ring, tol) => {
  const mid = Math.floor(ring.length / 2);
  return [...simplify(ring.slice(0, mid + 1), tol).slice(0, -1), ...simplify(ring.slice(mid), tol)];
};
/** Polígonos [[borde, ...huecos]] simplificados a `tol` grados (0,0015 ≈ 170 m) y sin islotes minúsculos. */
export function simplified(polys, tol = 0.0015, minArea = 1e-6) {
  return polys
    .map((poly) => poly.map((ring) => simplifyRing(ring, tol).map(([x, y]) => [r4(x), r4(y)])).filter((r) => r.length >= 4 && ringArea(r) > minArea))
    .filter((p) => p.length);
}

/** Centro del rectángulo que encierra el polígono más grande: dónde "ubicar" el área. */
export function centerOf(polys) {
  const biggest = polys.reduce((best, p) => (!best || ringArea(p[0]) > ringArea(best[0]) ? p : best), null);
  if (!biggest) return null;
  const xs = biggest[0].map((p) => p[0]);
  const ys = biggest[0].map((p) => p[1]);
  return { lat: r4((Math.min(...ys) + Math.max(...ys)) / 2), lon: r4((Math.min(...xs) + Math.max(...xs)) / 2) };
}


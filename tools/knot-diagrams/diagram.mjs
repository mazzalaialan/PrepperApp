/**
 * Diagramas de nudos propios (VikArg, GPL-3.0): cada cuerda es una curva suave
 * (Catmull-Rom) por puntos de control; los cruces se calculan solos y en cada
 * uno la parte que pasa por arriba se vuelve a dibujar con un borde del color
 * del fondo, que deja el hueco en la de abajo.
 * - Profundidad: cada punto puede llevar z ([x, y, z]; 0 si falta). Va arriba
 *   la de z mayor; lo que tiene z < 0 queda detrás de palos y argollas.
 * - Con la misma z va arriba la parte que se hizo después (el chicote que
 *   avanza pasa por encima); `under` da los cruces (posición aproximada) donde
 *   es al revés.
 */
// Fondo, borde y flechas toman los colores del tema de la app cuando el SVG va dentro de la página
// (variables --kd-*); como imagen suelta quedan los colores claros de respaldo.
const BG = 'var(--kd-bg, #ffffff)';
const EDGE = 'var(--kd-edge, #5f5a52)';
/** Grosor extra del filo claro que separa la cuerda de arriba de la de abajo en un cruce. */
const HALO = 2;
const ARROW = 'var(--kd-arrow, #d42a2a)';

function catmull(pts, step = 5) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]), u: i - 1 + t, z: (t < 0.5 ? p1[2] : p2[2]) ?? 0 });
    }
  }
  const last = pts[pts.length - 1];
  out.push({ x: last[0], y: last[1], u: pts.length - 1, z: last[2] ?? 0 });
  let s = 0;
  out.forEach((p, i) => {
    if (i) s += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y);
    p.s = s;
  });
  return out;
}

/** Mismo color, más oscuro (para lo que pasa por detrás). */
function shade(hex, k = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const r1 = (v) => Math.round(v * 10) / 10;
function pathD(pts) {
  // Coordenadas relativas con un decimal; se saltean los puntos que no cambian nada.
  let s = '', px = 0, py = 0;
  pts.forEach((p, i) => {
    const x = r1(p.x), y = r1(p.y);
    if (i && x === px && y === py) return;
    s += i ? `l${r1(x - px)} ${r1(y - py)}` : `M${x} ${y}`;
    px = x; py = y;
  });
  return s.replace(/ -/g, '-');
}

function inter(a, b, c, e) {
  const r = [b.x - a.x, b.y - a.y], q = [e.x - c.x, e.y - c.y];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * q[1] - (c.y - a.y) * q[0]) / den;
  const u = ((c.x - a.x) * r[1] - (c.y - a.y) * r[0]) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { t, u } : null;
}

/** Cruces entre todas las cuerdas (y de cada una consigo misma). */
function crossings(strands, W) {
  const xs = [];
  for (let a = 0; a < strands.length; a++)
    for (let b = a; b < strands.length; b++) {
      const A = strands[a].pts, B = strands[b].pts;
      for (let i = 0; i < A.length - 1; i++)
        for (let j = a === b ? i + 2 : 0; j < B.length - 1; j++) {
          const h = inter(A[i], A[i + 1], B[j], B[j + 1]);
          if (!h) continue;
          const sa = A[i].s + h.t * (A[i + 1].s - A[i].s), sb = B[j].s + h.u * (B[j + 1].s - B[j].s);
          if (a === b && Math.abs(sa - sb) < W * 2) continue;
          const x = A[i].x + h.t * (A[i + 1].x - A[i].x), y = A[i].y + h.t * (A[i + 1].y - A[i].y);
          const za = (h.t < 0.5 ? A[i] : A[i + 1]).z, zb = (h.u < 0.5 ? B[j] : B[j + 1]).z;
          const pa = { k: a, s: sa, z: za }, pb = { k: b, s: sb, z: zb };
          const [earlier, later] = a === b ? (sa < sb ? [pa, pb] : [pb, pa]) : [pa, pb];
          // Ángulo entre las dos cuerdas en el cruce (0° = casi paralelas: no se entiende cuál va arriba).
          const d1 = Math.atan2(A[i + 1].y - A[i].y, A[i + 1].x - A[i].x), d2 = Math.atan2(B[j + 1].y - B[j].y, B[j + 1].x - B[j].x);
          let ang = Math.abs(((d1 - d2) * 180) / Math.PI) % 180;
          if (ang > 90) ang = 180 - ang;
          xs.push({ x, y, earlier, later, ang });
        }
    }
  return xs;
}

/** Cuerdas, cruces y quién va arriba en cada uno (lo usan el dibujo y el análisis). */
function resolve(spec) {
  const { ropes = [], under = [], rope: W = 14 } = spec;
  const strands = ropes.map((r, k) => ({ color: '#e8a33d', light: '#f7d39a', ...r, k, pts: catmull(r.path) }));
  const xs = crossings(strands, W);
  xs.forEach((c, i) => {
    c.i = i;
    const flip = under.some(([x, y]) => Math.hypot(c.x - x, c.y - y) < 14);
    if (c.earlier.z !== c.later.z) [c.over, c.under] = c.earlier.z > c.later.z ? [c.earlier, c.later] : [c.later, c.earlier];
    else [c.over, c.under] = flip ? [c.earlier, c.later] : [c.later, c.earlier];
  });
  return { strands, xs, W };
}

/**
 * Recorrido de cada cuerda, en el orden en que se la sigue desde su primer punto: cada cruce con
 * "por arriba" o "por debajo" de qué cuerda y en qué lugar (x, y). Sirve para revisar el nudo sin mirar el dibujo.
 */
export function trace(spec) {
  const { strands, xs, W } = resolve(spec);
  // Un cruce es ambiguo si las cuerdas casi van en paralelo o si hay otro cruce tan cerca que los huecos se pisan.
  for (const c of xs) {
    const near = xs.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < W * 2.2);
    c.ambiguo = c.ang < 35 ? `ángulo de ${Math.round(c.ang)}° (casi paralelas)` : near ? 'otro cruce a menos de 2 grosores (los huecos se pisan)' : null;
  }
  return strands.map((r) => {
    const mine = [];
    for (const c of xs) {
      for (const side of ['over', 'under']) {
        if (c[side].k !== r.k) continue;
        const other = side === 'over' ? c.under : c.over;
        // Una cuerda que se cruza consigo misma aparece dos veces (una por cada pasada).
        if (c.over.k === c.under.k && c[side].s !== (side === 'over' ? c.over.s : c.under.s)) continue;
        mine.push({ s: c[side].s, pos: side === 'over' ? 'ARRIBA' : 'ABAJO', cruzaCon: other.k === r.k ? 'sí misma' : `cuerda ${other.k}`, x: Math.round(c.x), y: Math.round(c.y), mismaProfundidad: c.over.z === c.under.z, angulo: Math.round(c.ang), ambiguo: c[side].k === r.k || true ? c.ambiguo : null });
      }
    }
    mine.sort((a, b) => a.s - b.s);
    const first = r.path[0], last = r.path[r.path.length - 1];
    return { cuerda: r.k, desde: [first[0], first[1]], hasta: [last[0], last[1]], puntaLibre: r.end !== false, cruces: mine };
  });
}

export function render(spec, { debug = false, id: P = "" } = {}) {
  const { width = 400, height = 300, poles = [], arrows = [] } = spec;
  const { strands, xs, W } = resolve(spec);
  const defs = [];
  const body = [];
  // Fondo y borde con clase (colores del tema); el resto, color fijo.
  const use = (id, stroke, w) =>
    stroke === BG ? `<use href="#${id}" class="kdb" stroke-width="${w}"/>` : stroke === EDGE ? `<use href="#${id}" class="kde" stroke-width="${w}"/>` : `<use href="#${id}" stroke="${stroke}" stroke-width="${w}"/>`;
  const draw = (r, pts, casing = pts, fillPts = pts) => {
    if (pts.length < 2) return;
    const id = `${P}p${defs.length}`;
    defs.push(`<path id="${id}" d="${pathD(pts)}"/>`);
    let cid = id;
    if (casing !== pts && casing.length >= 2) {
      cid = `${P}p${defs.length}`;
      defs.push(`<path id="${cid}" d="${pathD(casing)}"/>`);
    }
    // La cuerda de arriba se apoya sobre la de abajo: solo un filo claro entre las dos, sin un hueco ancho que haga dudar.
    if (casing.length >= 2) body.push(use(cid, BG, W + HALO));
    const back = pts[Math.floor(pts.length / 2)].z <= -1;
    let fid = id;
    if (fillPts !== pts && fillPts.length >= 2) {
      // El relleno sigue un poco más allá del borde: tapa la costura donde empalma con el resto de la cuerda.
      fid = `${P}p${defs.length}`;
      defs.push(`<path id="${fid}" d="${pathD(fillPts)}"/>`);
    }
    body.push(use(id, EDGE, W), use(fid, back ? shade(r.color) : r.color, W - 5), use(fid, back ? shade(r.light) : r.light, W * 0.28));
  };
  const endCap = (r) => {
    if (r.end === false) return;
    const p = r.pts[r.pts.length - 1];
    const c = `cx="${r1(p.x)}" cy="${r1(p.y)}"`;
    body.push(`<circle ${c} r="${W / 2 + 3}" class="kdbf"/><circle ${c} r="${W / 2}" class="kdef"/><circle ${c} r="${W / 2 - 2.5}" fill="${r.color}"/>`);
  };
  const pass = (filter) => {
    for (const r of strands) {
      let run = [];
      for (const p of r.pts) {
        // Lo de atrás va más oscuro: cortar el tramo donde cambia de lado.
        if (run.length && (p.z <= -1) !== (run[run.length - 1].z <= -1)) {
          run.push(p);
          draw(r, run);
          run = [p];
          continue;
        }
        if (filter(r, p)) run.push(p);
        else {
          draw(r, run);
          run = [];
        }
      }
      draw(r, run);
      if (filter(r, r.pts[r.pts.length - 1])) endCap(r);
    }
    for (const c of xs) {
      const r = strands[c.over.k];
      if (!filter(r, { z: c.over.z })) continue;
      const near = (d) => r.pts.filter((p) => p.s >= c.over.s - d && p.s <= c.over.s + d && filter(r, p));
      const pts = near(W * 1.3);
      draw(r, pts, near(W * 0.8), near(W * 1.3 + 4));
      if (pts.includes(r.pts[r.pts.length - 1])) endCap(r);
    }
  };
  const layered = poles.length > 0;
  pass(layered ? (r, p) => p.z < 0 : () => true);
  for (const pole of poles) {
    if (pole.kind === 'ring') body.push(`<circle cx="${pole.x}" cy="${pole.y}" r="${pole.r}" fill="none" stroke="#7b818c" stroke-width="${pole.w ?? 11}"/><circle cx="${pole.x}" cy="${pole.y}" r="${pole.r}" fill="none" stroke="#b8bec8" stroke-width="${(pole.w ?? 11) * 0.35}"/>`);
    else if (pole.kind === 'path') body.push(`<path d="${pole.d}" fill="${pole.fill ?? '#9aa1ab'}" stroke="${pole.stroke ?? '#5c626b'}" stroke-width="3"/>`);
    else body.push(`<rect x="${pole.x}" y="${pole.y}" width="${pole.w}" height="${pole.h}" rx="${pole.rx ?? Math.min(pole.w, pole.h) / 5}" fill="${pole.fill ?? '#a07c55'}" stroke="${pole.stroke ?? '#6b5136'}" stroke-width="3"${pole.rotate ? ` transform="rotate(${pole.rotate} ${pole.x + pole.w / 2} ${pole.y + pole.h / 2})"` : ''}/>`);
  }
  if (layered) pass((r, p) => p.z >= 0);
  for (const a of arrows) {
    body.push(`<path d="${pathD(catmull(a, 4))}" fill="none" class="kda" stroke-width="4" stroke-dasharray="10 7" marker-end="url(#${P}ah)"/>`);
  }
  if (debug) {
    for (const r of strands) r.path.forEach(([x, y], i) => body.push(`<circle cx="${x}" cy="${y}" r="3" fill="blue"/><text x="${x + 4}" y="${y - 4}" font-size="11" fill="blue">${r.k}.${i}</text>`));
    for (const c of xs) body.push(`<text x="${r1(c.x)}" y="${r1(c.y + 5)}" font-size="15" font-weight="bold" fill="red" text-anchor="middle">${Math.round(c.x)},${Math.round(c.y)}</text>`);
  }
  const marker = arrows.length ? `<marker id="${P}ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" class="kdaf"/></marker>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs>${marker}${defs.join('')}</defs><style>.kdb{stroke:${BG}}.kde{stroke:${EDGE}}.kdbf{fill:${BG}}.kdef{fill:${EDGE}}.kda{stroke:${ARROW}}.kdaf{fill:${ARROW}}</style><rect width="100%" height="100%" class="kdbf"/><g fill="none" stroke-linejoin="round"${spec.zoom ? ` transform="translate(${spec.zoom[1]} ${spec.zoom[2]}) scale(${spec.zoom[0]}) translate(${-spec.zoom[1]} ${-spec.zoom[2]})"` : ''}>${body.join('')}</g></svg>`;
}

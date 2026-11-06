/** Ayudas para armar figuras: colores, desplazar/escalar puntos y vueltas alrededor de un eje. */
export const A = { color: '#e8a33d', light: '#f7d39a' }; // cuerda 1 (naranja)
export const B = { color: '#3d8fd1', light: '#a9d2f2' }; // cuerda 2 (azul)
export const G = { color: '#58a55c', light: '#b5e0b5' }; // cordino (verde)

export const move = (pts, dx, dy) => pts.map(([x, y, z]) => (z === undefined ? [x + dx, y + dy] : [x + dx, y + dy, z]));
export const scale = (pts, k, cx = 0, cy = 0) => pts.map(([x, y, z]) => [cx + (x - cx) * k, cy + (y - cy) * k, ...(z === undefined ? [] : [z])]);
export const flipX = (pts, cx) => pts.map(([x, y, z]) => [2 * cx - x, y, ...(z === undefined ? [] : [z])]);
export const z = (pts, depth) => pts.map(([x, y]) => [x, y, depth]);

/**
 * Vueltas alrededor de un eje vertical en `x` (palo o cuerda), desde `y`
 * hacia abajo (o arriba con `up`): cada vuelta cruza adelante en diagonal
 * (z = 1) y vuelve por detrás (z = -1). `r`: distancia del eje a la cuerda en
 * los costados. `from`: de qué costado arranca.
 */
export function coilV({ x, y, n, pitch, r, from = 'left', up = false, tilt = 0 }) {
  // `tilt`: un poco de perspectiva (la vuelta de atrás corrida), para que se lean como espiras y no como zigzag.
  const s = from === 'left' ? -1 : 1, d = up ? -1 : 1;
  const out = [];
  for (let i = 0; i <= n * 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    out.push([x + s * r * Math.cos(th), y + d * (pitch * (i / 8) + tilt * r * Math.sin(th)), Math.sin(th) >= -1e-9 && Math.sin(th) <= 1e-9 ? 0 : Math.sin(th) > 0 ? 1 : -1]);
  }
  return out;
}

/** Igual que coilV, alrededor de un eje horizontal en `y`, hacia la derecha (o la izquierda con `left`). */
export function coilH({ x, y, n, pitch, r, from = 'top', left = false, tilt = 0 }) {
  return coilV({ x: y, y: x, n, pitch, r, from: from === 'top' ? 'left' : 'right', up: left, tilt }).map(([a, b, c]) => [b, a, c]);
}

// Nudo simple flojo (el del paso 2 del nudo simple): firme que llega por la izquierda en y = 210.
const OH = [[100, 210], [200, 210], [270, 175], [285, 110], [235, 60], [170, 72], [148, 130], [172, 210], [185, 250], [212, 270], [238, 248], [228, 205], [215, 150], [232, 112], [290, 95]];
/** Simple flojo transformado: k escala, (x, y) donde queda el centro de la gaza; `mirror` lo da vuelta. Devuelve { path, under, center }. */
export function overhand({ x, y, k = 0.6, mirror = false, flip = false }) {
  const cx = 215, cy = 140;
  const t = ([px, py]) => [x + (mirror ? -1 : 1) * (px - cx) * k, y + (flip ? -1 : 1) * (py - cy) * k];
  return { path: OH.map(t), under: [t([228, 205])] };
}

/** Copia paralela de una cuerda (a `d` px a la izquierda del sentido de avance), con la misma z: para repasar un nudo con otra cuerda. */
export function offset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] + (dy / L) * d, p[1] - (dx / L) * d, ...(p[2] === undefined ? [] : [p[2]])];
  });
}
export const rev = (pts) => [...pts].reverse();

/** Ocho flojo con la profundidad marcada en cada cruce (para repasarlo con otra cuerda). Firme por la izquierda en y = 220. */
export const E8 = [[-20, 220], [100, 220], [150, 220, 0.5], [194, 220, -0.5], [235, 216], [290, 180], [296, 135, 0.5], [290, 100], [245, 65], [185, 80], [168, 140], [178, 180, -0.5], [194, 220, 0.5], [215, 265], [180, 290], [140, 270], [150, 220, -0.5], [178, 180, 0.5], [245, 140], [296, 135, -0.5], [350, 142]];
/** Simple flojo con la profundidad en cada cruce. Firme por la izquierda en y = 210. */
export const OHZ = [[-20, 210], [100, 210], [173, 211, -0.5], [227, 208, 0.5], [270, 175], [286, 125], [279, 97, -0.5], [235, 60], [170, 72], [148, 130], [173, 211, 0.5], [185, 250], [212, 270], [238, 248], [227, 208, -0.5], [215, 150], [232, 112], [279, 97, 0.5], [345, 105]];

/** Vueltas alrededor de un eje recto cualquiera, de `a` a `b` (por ejemplo, el chicote enroscado sobre un tramo de la misma cuerda). */
export function coilAlong(a, b, n, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  const out = [];
  for (let i = 0; i <= n * 8; i++) {
    const t = i / (n * 8), th = (i / 8) * Math.PI * 2, s = Math.sin(th);
    out.push([a[0] + dx * t + nx * r * Math.cos(th), a[1] + dy * t + ny * r * Math.cos(th), Math.abs(s) < 1e-9 ? 0 : s > 0 ? 1 : -1]);
  }
  return out;
}

/**
 * ¿Qué nudo es, de verdad, lo que está dibujado? Sin mirar imágenes.
 *   node tipo.mjs <id>… | all
 * Para cada figura de UNA sola cuerda con las dos puntas libres (un "nudo largo") calcula dos
 * invariantes, que no cambian al mover la cuerda sin cortarla:
 * - v2: coeficiente de grado 2 del polinomio de Conway (fórmula de Polyak y Viro sobre el diagrama de Gauss);
 * - det: el determinante (|Δ(−1)|, por coloreo), cerrando las puntas por afuera.
 * Si el dibujo da otros valores que el nudo real, el dibujo NO es ese nudo (le falta o le sobra una
 * pasada, o un cruce está al revés). Valores de la tabla de nudos: sin nudo v2 0, det 1; simple (3₁)
 * 1 y 3; ocho (4₁) −1 y 5; doble nudo simple (5₁, tórico 2,5) 3 y 5; triple (7₁) 6 y 7.
 * Valores iguales no prueban que sea el mismo nudo, pero distintos prueban que no.
 * El det supone que las dos puntas quedan del lado de afuera del dibujo (se unen sin cruzar nada).
 * En refs/<id>.json, `"v2"` y `"det"` (del paso terminado) se comparan solos.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from './diagram.mjs';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('uso: node tipo.mjs <id>… | all');
  process.exit(1);
}
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}`, import.meta.url))).default);
}

/**
 * Una sola cuerda abierta y sin palos (las de `end: false` siguen fuera del dibujo: también sirven).
 * Un anillo cerrado (cordino) o varias cuerdas son otro objeto: no se calcula.
 */
function isLongKnot(fig, strands) {
  if (strands.length !== 1 || (fig.poles ?? []).length) return false;
  const p = strands[0].pts;
  return Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) > 1;
}

/** v2 de una figura de una sola cuerda; null si no corresponde (varias cuerdas, palos o anillo cerrado). */
export function v2(fig) {
  const { strands, xs } = resolve(fig);
  if (!isLongKnot(fig, strands)) return null;
  // Pasadas a lo largo de la cuerda: [s, cruce, por arriba?]. Signo del cruce: producto vectorial
  // (arriba × abajo); la convención no importa porque v2 multiplica dos signos.
  const passes = [];
  const sign = xs.map((c) => Math.sign(c.over.dx * c.under.dy - c.over.dy * c.under.dx));
  xs.forEach((c, i) => {
    passes.push([c.over.s, i, true], [c.under.s, i, false]);
  });
  passes.sort((a, b) => a[0] - b[0]);
  const first = new Map(), second = new Map(), firstOver = new Map();
  passes.forEach(([, i, over], pos) => {
    if (first.has(i)) second.set(i, pos);
    else {
      first.set(i, pos);
      firstOver.set(i, over);
    }
  });
  // Polyak–Viro: pares de cruces entrelazados (i, j, i, j) donde i pasa primero por arriba y j primero por abajo.
  let v = 0;
  for (const i of first.keys())
    for (const j of first.keys()) {
      if (i === j) continue;
      if (first.get(i) < first.get(j) && first.get(j) < second.get(i) && second.get(i) < second.get(j) && firstOver.get(i) && !firstOver.get(j)) v += sign[i] * sign[j];
    }
  return v;
}

/** Determinante por coloreo: matriz de cruces × arcos (2·arriba − los dos de abajo), un menor. */
export function det(fig) {
  const { strands, xs } = resolve(fig);
  if (!isLongKnot(fig, strands)) return null;
  const passes = [];
  xs.forEach((c, i) => passes.push([c.over.s, i, true], [c.under.s, i, false]));
  passes.sort((a, b) => a[0] - b[0]);
  // Arcos: la cuerda se corta en cada pasada por abajo; al cerrarla, el último arco es el primero.
  let arc = 0;
  const overArc = new Map(), underArcs = new Map();
  for (const [, i, over] of passes) {
    if (over) overArc.set(i, arc);
    else underArcs.set(i, [arc, ++arc]);
  }
  const n = arc;
  if (n <= 1) return 1;
  const m = xs.map((_, i) => {
    const row = Array(n).fill(0n);
    row[overArc.get(i) % n] += 2n;
    for (const a of underArcs.get(i)) row[a % n] -= 1n;
    return row;
  });
  // Menor sin la primera fila ni la primera columna (Bareiss, enteros exactos).
  const A = m.slice(1).map((r) => r.slice(1));
  const k = A.length;
  let prev = 1n;
  for (let i = 0; i < k; i++) {
    let piv = i;
    while (piv < k && A[piv][i] === 0n) piv++;
    if (piv === k) return 0;
    if (piv !== i) [A[i], A[piv]] = [A[piv], A[i]];
    for (let r = i + 1; r < k; r++) {
      for (let c = i + 1; c < k; c++) A[r][c] = (A[r][c] * A[i][i] - A[r][i] * A[i][c]) / prev;
      A[r][i] = 0n;
    }
    prev = A[i][i];
  }
  const d = A[k - 1][k - 1];
  return Number(d < 0n ? -d : d);
}

const ids = args[0] === 'all' ? Object.keys(all) : args;
for (const id of ids) {
  const refPath = new URL(`./refs/${id}.json`, import.meta.url);
  if (!all[id]) {
    console.log(`${id}: no existe`);
    continue;
  }
  const ref = existsSync(refPath) ? JSON.parse(readFileSync(refPath, 'utf8')) : {};
  const vals = all[id].map((fig) => (fig && v2(fig) !== null ? { v2: v2(fig), det: det(fig) } : null));
  const last = vals.filter(Boolean).at(-1);
  let verdict = '';
  if (last && ref.v2 !== undefined) {
    const ok = last.v2 === ref.v2 && (ref.det === undefined || last.det === ref.det);
    verdict = ok ? `  ✔ es el nudo esperado (v2 ${ref.v2}, det ${ref.det ?? '?'})` : `  ✘ NO es el nudo esperado (debería ser v2 ${ref.v2}, det ${ref.det ?? '?'})`;
  }
  console.log(`${id}: ${vals.map((v, n) => `paso ${n + 1}: ${v ? `v2 ${v.v2} det ${v.det}` : '—'}`).join(' · ')}${verdict}`);
}

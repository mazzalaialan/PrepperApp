/**
 * Recorrido de las cuerdas de cada figura, en texto (para revisar el nudo sin mirar el dibujo).
 *   node trace.mjs <id> [<paso>]
 * Por cuerda, desde su primer punto (normalmente el firme, a la izquierda) hasta la punta:
 * cada cruce con ARRIBA/ABAJO, con qué cuerda y dónde. Si dos partes tienen la misma
 * profundidad, quién va arriba sale del orden en que se hizo (lo posterior, arriba) o de `under`.
 */
import { readdirSync } from 'node:fs';
import { trace } from './diagram.mjs';

const [id, step] = process.argv.slice(2);
if (!id) {
  console.error('uso: node trace.mjs <id> [<paso>]');
  process.exit(1);
}
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}`, import.meta.url))).default);
}
if (!all[id]) {
  console.error(`sin figuras: ${id}`);
  process.exit(1);
}
all[id].forEach((fig, n) => {
  if (step && Number(step) !== n + 1) return;
  if (!fig) {
    console.log(`\n== ${id} paso ${n + 1}: sin figura propia (usa la anterior)`);
    return;
  }
  console.log(`\n== ${id} paso ${n + 1}`);
  for (const r of trace(fig)) {
    console.log(`cuerda ${r.cuerda}: de (${r.desde}) a (${r.hasta})${r.puntaLibre ? ' [con punta]' : ''}`);
    r.cruces.forEach((c, i) => console.log(`  ${i + 1}. (${c.x},${c.y}) pasa ${c.pos} de ${c.cruzaCon}${c.mismaProfundidad ? '' : ' [por profundidad z]'}`));
    if (!r.cruces.length) console.log('  sin cruces');
  }
});

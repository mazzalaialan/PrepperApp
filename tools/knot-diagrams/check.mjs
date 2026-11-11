/**
 * Verificación automática de los diagramas, sin mirar imágenes (barata).
 *   node check.mjs <id>… | all
 * Por figura: cantidad de cruces, la secuencia arriba/abajo de cada cuerda (A = por arriba, B = por abajo,
 * siguiendo la cuerda desde su primer punto), los cruces ⚠ ambiguos (ángulo < 35° o a menos de 1,6 grosores de otro).
 * Si existe refs/<id>.json, compara con la secuencia leída de la referencia real y dice COINCIDE / NO COINCIDE
 * (acepta el espejo: cambiar A por B en toda la secuencia). Sin archivo: SIN REFERENCIA.
 * refs/<id>.json: { "fuente": "archivo, autor, licencia", "pasos": { "3": ["ABABAB", "BABABA"] }, "notas": "..." }
 * (una cadena por cuerda, en el orden de las cuerdas del spec; "pasos" solo con los pasos que se pudieron leer).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { trace } from './diagram.mjs';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('uso: node check.mjs <id>… | all');
  process.exit(1);
}
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}`, import.meta.url))).default);
}
const ids = args[0] === 'all' ? Object.keys(all) : args;
const mirror = (s) => [...s].map((c) => (c === 'A' ? 'B' : c === 'B' ? 'A' : c)).join('');
let bad = 0;
for (const id of ids) {
  if (!all[id]) {
    console.log(`${id}: no existe`);
    bad++;
    continue;
  }
  const refPath = new URL(`./refs/${id}.json`, import.meta.url);
  const ref = existsSync(refPath) ? JSON.parse(readFileSync(refPath, 'utf8')) : null;
  console.log(`\n## ${id} ${ref ? '(ref: ' + ref.fuente + ')' : '(SIN REFERENCIA)'}`);
  all[id].forEach((fig, n) => {
    if (!fig) {
      console.log(`  paso ${n + 1}: sin figura propia`);
      return;
    }
    const ropes = trace(fig);
    const seqs = ropes.map((r) => r.cruces.map((c) => (c.pos === 'ARRIBA' ? 'A' : 'B')).join(''));
    const amb = ropes.flatMap((r) => r.cruces.filter((c) => c.ambiguo).map((c) => `(${c.x},${c.y})`));
    const uniqAmb = [...new Set(amb)];
    let cmp = '';
    const want = ref?.pasos?.[String(n + 1)];
    if (want) {
      const ok = want.length === seqs.length && want.every((w, i) => seqs[i] === w || seqs[i] === mirror(w));
      cmp = ok ? '  ✔ COINCIDE con la referencia' : `  ✘ NO COINCIDE (referencia: ${want.join(' | ')})`;
      if (!ok) bad++;
    }
    console.log(`  paso ${n + 1}: ${seqs.map((s, i) => `cuerda ${i}: ${s || '—'}`).join(' · ')}${uniqAmb.length ? `  ⚠ ${uniqAmb.length} ambiguos ${uniqAmb.slice(0, 6).join(' ')}${uniqAmb.length > 6 ? '…' : ''}` : ''}${cmp}`);
  });
}
process.exit(bad ? 1 : 0);

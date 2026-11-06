/**
 * Arma los diagramas de nudos paso a paso (app/public/knots/pasos/<id>-<n>.svg).
 *   node build.mjs              todos
 *   node build.mjs simple ancla solo esos, y una hoja PNG para revisar
 *   --debug                     en la hoja, puntos de control y cruces
 * Las figuras están en specs/*.mjs: cada archivo exporta { <id>: [figura, ...] }.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { render } from './diagram.mjs';

const OUT = new URL('../../app/public/knots/pasos/', import.meta.url);
const args = process.argv.slice(2);
const debug = args.includes('--debug');
const only = args.filter((a) => !a.startsWith('--'));
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}?${Date.now()}`, import.meta.url))).default);
}
mkdirSync(OUT, { recursive: true });
const ids = only.length ? only : Object.keys(all);
let total = 0;
for (const id of ids) {
  if (!all[id]) throw new Error(`sin figuras: ${id}`);
  all[id].forEach((fig, n) => {
    if (!fig) return;
    writeFileSync(new URL(`${id}-${n + 1}.svg`, OUT), render(fig));
    total++;
  });
}
console.log(`${total} figuras`);
// Índice para la app: número de figura de cada paso (un paso sin figura propia usa la anterior).
if (!only.length) {
  const index = {};
  for (const [id, figs] of Object.entries(all)) {
    let last = 0;
    index[id] = figs.map((f, n) => (f ? (last = n + 1) : last));
  }
  writeFileSync(new URL('../../app/src/modules/knots/diagrams.json', import.meta.url), JSON.stringify(index, null, 0) + '\n');
}
if (only.length) {
  const { chromium } = await import('../../app/node_modules/playwright/index.mjs');
  const html = `<body style="margin:0;background:#bbb;font:13px sans-serif">${ids
    .map((id) => `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${all[id].map((f, n) => (f ? `<div>${render(f, { debug, id: `${id}${n}` })}<div>${id} ${n + 1}</div></div>` : '')).join('')}</div>`)
    .join('')}</body>`;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1250, height: 300 } });
  await p.setContent(html);
  await p.screenshot({ path: process.env.SHEET ?? '/tmp/knot-sheet.png', fullPage: true });
  await b.close();
}

/**
 * UNA sola imagen para revisar una figura: la figura completa y, al lado, solo los cruces ambiguos ampliados.
 *   node montage.mjs <id> <paso> [salida.png]      (por defecto /tmp/nudos-revision/<id>-<paso>.png)
 * Si no hay cruces ambiguos, muestra además los 4 de menor ángulo. Se abre con una sola lectura de imagen.
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { render, trace } from './diagram.mjs';

const [id, step, outArg] = process.argv.slice(2);
if (!id || !step) {
  console.error('uso: node montage.mjs <id> <paso> [salida.png]');
  process.exit(1);
}
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}`, import.meta.url))).default);
}
const fig = all[id]?.[Number(step) - 1];
if (!fig) {
  console.error('esa figura no existe o no tiene dibujo propio');
  process.exit(1);
}
const out = outArg ?? `/tmp/nudos-revision/${id}-${step}.png`;
mkdirSync(new URL('.', `file://${out}`).pathname, { recursive: true });
const spots = new Map();
for (const r of trace(fig)) for (const c of r.cruces) spots.set(`${c.x},${c.y}`, c);
let list = [...spots.values()].filter((c) => c.ambiguo);
if (!list.length) list = [...spots.values()].sort((a, b) => a.angulo - b.angulo).slice(0, 4);
list = list.slice(0, 8);
const W = fig.width ?? 400, H = fig.height ?? 300;
const svg = render(fig, { id: 'm' });
const cell = (c) => {
  const R = 45;
  const s = svg.replace(/viewBox="[^"]*" width="\d+" height="\d+"/, `viewBox="${c.x - R} ${c.y - R} ${2 * R} ${2 * R}" width="230" height="230"`);
  return `<div style="display:inline-block;margin:4px;border:1px solid #888;font:11px sans-serif">${s}<div>(${c.x},${c.y}) ${c.angulo}° ${c.ambiguo ? '⚠' : ''}</div></div>`;
};
const html = `<body style="margin:6px;background:#fff"><div style="display:flex;gap:10px;align-items:flex-start"><div>${svg.replace(/width="\d+" height="\d+"/, `width="${Math.min(520, W)}" height="${(Math.min(520, W) * H) / W}"`)}<div style="font:12px sans-serif">${id} paso ${step}</div></div><div style="max-width:980px">${list.map(cell).join('')}</div></div></body>`;
const { chromium } = await import('../../app/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 700 }, deviceScaleFactor: 1.5 });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(out);

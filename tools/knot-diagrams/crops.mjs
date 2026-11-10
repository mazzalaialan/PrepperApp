/**
 * Recortes ampliados de cada cruce de una figura, para ver a ojo si se entiende cuál cuerda va por arriba.
 *   node crops.mjs <id> <paso> [carpeta]     (por defecto /tmp/nudos-revision/cruces/)
 * Guarda <id>-<paso>-c<n>.png (cada cruce, 5 veces más grande, con su posición en el nombre del log)
 * y <id>-<paso>-completa.png (la figura entera ampliada). Regla de revisión: en cada recorte la cuerda de
 * arriba tiene que verse CONTINUA y la de abajo tiene que mostrar un hueco a cada lado, bien visible.
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { render, trace } from './diagram.mjs';

const [id, step, outArg] = process.argv.slice(2);
if (!id || !step) {
  console.error('uso: node crops.mjs <id> <paso> [carpeta]');
  process.exit(1);
}
const out = outArg ?? '/tmp/nudos-revision/cruces';
mkdirSync(out, { recursive: true });
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}`, import.meta.url))).default);
}
const fig = all[id]?.[Number(step) - 1];
if (!fig) {
  console.error('esa figura no existe o no tiene dibujo propio');
  process.exit(1);
}
const spots = new Map();
for (const r of trace(fig)) for (const c of r.cruces) spots.set(`${c.x},${c.y}`, c);
const { chromium } = await import('../../app/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const SCALE = 5;
const p = await b.newPage({ viewport: { width: (fig.width ?? 400) + 20, height: (fig.height ?? 300) + 20 }, deviceScaleFactor: SCALE });
await p.setContent(`<body style="margin:0;background:#fff">${render(fig, { id: 'z' })}</body>`);
await p.screenshot({ path: `${out}/${id}-${step}-completa.png`, clip: { x: 0, y: 0, width: fig.width ?? 400, height: fig.height ?? 300 } });
let n = 0;
for (const [key, c] of spots) {
  n++;
  const R = 45;
  await p.screenshot({ path: `${out}/${id}-${step}-c${n}.png`, clip: { x: Math.max(0, c.x - R), y: Math.max(0, c.y - R), width: 2 * R, height: 2 * R } });
  console.log(`c${n}: (${key}) ${c.ambiguo ? '⚠ ' + c.ambiguo : 'ángulo ' + c.angulo + '°'}`);
}
await b.close();
console.log(`${n} recortes en ${out}`);

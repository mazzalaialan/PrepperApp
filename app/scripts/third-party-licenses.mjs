#!/usr/bin/env node
/**
 * Licencias de las dependencias que viajan dentro de la app (solo `dependencies` y lo que ellas piden),
 * con su texto, para la pantalla «Licencias y créditos»: src/core/third-party-licenses.json.
 * Uso (desde app/): node scripts/third-party-licenses.mjs   — se vuelve a correr al cambiar las dependencias.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkgOf = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const seen = new Map();

function find(name, from) {
  // Busca node_modules/<name> subiendo desde la carpeta del paquete que lo pide.
  let dir = from;
  for (;;) {
    const p = join(dir, 'node_modules', name);
    if (existsSync(join(p, 'package.json'))) return p;
    const up = join(dir, '..');
    if (up === dir || dir === '/') return null;
    dir = up;
  }
}

function visit(name, from) {
  const dir = find(name, from);
  if (!dir) return;
  const pkg = pkgOf(dir);
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying|unlicense)(\.|$)/i.test(f));
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(' OR ') ?? '';
  const repo = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');
  const url = /^https?:/.test(repo) ? repo : pkg.homepage ?? '';
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? '';
  // Sin archivo de licencia en el paquete: queda la licencia declarada, el autor y dónde está el texto completo.
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `Licencia ${license}${author ? `. Autor: ${author}` : ''}. El paquete no trae el texto en un archivo${url ? `; está en ${url}` : ''}.`;
  seen.set(key, { name: pkg.name, version: pkg.version, license: license || 'ver el texto', url, text });
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) visit(dep, dir);
}

const app = pkgOf(root);
for (const dep of Object.keys(app.dependencies ?? {})) visit(dep, root);
const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(root, 'src/core/third-party-licenses.json'), JSON.stringify(list));
console.log(`${list.length} paquetes; sin texto de licencia: ${list.filter((p) => !p.text).map((p) => p.name).join(', ') || 'ninguno'}`);
console.log([...new Set(list.map((p) => p.license))].join(' | '));

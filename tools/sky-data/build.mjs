#!/usr/bin/env node
/**
 * Genera los datos del Mapa estelar (app/src/modules/starmap/sky-data.json)
 * a partir de d3-celestial (Olaf Frohn, licencia BSD-3-Clause):
 * https://github.com/ofrohn/d3-celestial
 *
 * - Estrellas hasta magnitud 6 (visibles a simple vista), con color (B−V).
 * - Nombre propio de las estrellas que lo tienen, en español si existe.
 * - Líneas y nombres (español e inglés) de las 88 constelaciones.
 *
 * Uso: node tools/sky-data/build.mjs   (necesita conexión; el resultado se versiona)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data';
const OUT = fileURLToPath(new URL('../../app/src/modules/starmap/sky-data.json', import.meta.url));

/** Nombres que conviene mostrar distinto de como vienen en la fuente. */
const NAME_OVERRIDES = {
  11767: 'Polaris (Estrella Polar)',
  71683: 'Alfa Centauri',
  68702: 'Hadar (Beta Centauri)',
};

const get = async (file) => {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.json();
};

const r2 = (n) => Math.round(n * 100) / 100;
/** La fuente trae espacios no separables y otros invisibles en algunos nombres. */
const clean = (s) => (s ?? '').replace(/[\s ​-‏⁠﻿]+/g, ' ').trim();
/** d3-celestial usa la ascensión recta en grados de −180 a 180: se pasa a 0–360. */
const ra = (lon) => r2(lon < 0 ? lon + 360 : lon);

const [stars, names, constellations, lines] = await Promise.all([
  get('stars.6.json'),
  get('starnames.json'),
  get('constellations.json'),
  get('constellations.lines.json'),
]);

const starRows = stars.features
  .map((f) => {
    const [lon, dec] = f.geometry.coordinates;
    const hip = f.id;
    const n = names[hip];
    const name = clean(NAME_OVERRIDES[hip] ?? (n?.es || n?.name));
    const bv = Number.parseFloat(f.properties.bv);
    // [ascensión recta°, declinación°, magnitud, B−V, nombre?, HIP?] (el HIP solo en las que tienen nombre)
    const row = [ra(lon), r2(dec), Math.round(f.properties.mag * 10) / 10, Number.isFinite(bv) ? Math.round(bv * 10) / 10 : 0.6];
    return name ? [...row, name, hip] : row;
  })
  .sort((a, b) => a[2] - b[2]); // las más brillantes primero: se dibujan encima

const lineById = new Map(lines.features.map((f) => [f.id, f.geometry.coordinates]));
const constellationRows = constellations.features.map((f) => ({
  id: f.id,
  es: clean(f.properties.es || f.properties.name),
  // En inglés se usan los nombres latinos de la IAU (Orion, Crux), que es como se conocen.
  en: clean(f.properties.name),
  center: [ra(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1])],
  lines: (lineById.get(f.id) ?? []).map((line) => line.map(([lon, dec]) => [ra(lon), r2(dec)])),
}));

const data = {
  source: 'd3-celestial (Olaf Frohn), BSD-3-Clause — https://github.com/ofrohn/d3-celestial',
  stars: starRows,
  constellations: constellationRows,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
console.log(`${starRows.length} estrellas (${starRows.filter((s) => s.length > 4).length} con nombre), ${constellationRows.length} constelaciones → ${OUT}`);

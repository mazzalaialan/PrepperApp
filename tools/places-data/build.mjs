#!/usr/bin/env node
/**
 * Genera el nomenclátor de localidades argentinas incluido en la app (funciona
 * sin conexión): app/src/modules/emergency/places-ar.json
 *
 * Sirve para ubicar repetidoras importadas sin coordenadas (las exportaciones
 * CSV de RepeaterBook solo traen el nombre de la localidad).
 *
 * - Asentamientos de Georef (INDEC / IGN, datos.gob.ar, CC BY 4.0): nombre,
 *   provincia, categoría y centroide.
 * - Población de Natural Earth (dominio público), para desempatar nombres
 *   repetidos (hay varias "Avellaneda", "San Pedro", "Junín"…).
 *
 * Uso: node tools/places-data/build.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/src/modules/emergency/places-ar.json', import.meta.url));
const GEOREF = 'https://infra.datos.gob.ar/georef/asentamientos.json';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const km = (lat1, lon1, lat2, lon2) => Math.hypot((lat1 - lat2) * 111, (lon1 - lon2) * 111 * Math.cos((lat1 * Math.PI) / 180));

/** Peso por categoría: ciudades y pueblos antes que parajes. */
const CATEGORY = { 'Componente de localidad compuesta': 3, Entidad: 3, 'Localidad simple': 2, Paraje: 0 };

const [{ asentamientos }, ne] = await Promise.all([get(GEOREF), get(NE)]);
const cities = ne.features.filter((f) => f.properties.adm0_a3 === 'ARG');

const provinces = [...new Set(asentamientos.map((a) => a.provincia.nombre))].sort();
const places = [];
for (const a of asentamientos) {
  if (!(a.categoria in CATEGORY)) continue;
  const { lat, lon } = a.centroide;
  const n = norm(a.nombre);
  const pop = Math.max(
    0,
    ...cities
      .filter((f) => norm(f.properties.name) === n && km(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) < 30)
      .map((f) => f.properties.pop_max),
  );
  // Cabecera de partido/departamento o municipio: suele ser la más conocida.
  const head = norm(a.departamento.nombre ?? '') === n || norm(a.gobierno_local.nombre ?? '') === n ? 500 : 0;
  const rank = pop + CATEGORY[a.categoria] * 1000 + head;
  places.push([a.nombre, provinces.indexOf(a.provincia.nombre), Math.round(lat * 1e3) / 1e3, Math.round(lon * 1e3) / 1e3, rank]);
}
places.sort((x, y) => y[4] - x[4]);

await writeFile(
  OUT,
  JSON.stringify({
    source: 'Georef — INDEC / IGN (datos.gob.ar, CC BY 4.0); población: Natural Earth',
    generatedAt: new Date().toISOString().slice(0, 10),
    provinces,
    places,
  }),
);
console.log(`${places.length} lugares → ${OUT}`);

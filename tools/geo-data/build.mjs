#!/usr/bin/env node
/**
 * Genera el mapa base del Mapa de Meteorología
 * (app/src/modules/weathermap/geo-data.json):
 *
 * - Provincias de Argentina, regiones de Chile y departamentos de Uruguay,
 *   Bolivia y Perú, más el contorno del resto de América del Sur y las Islas
 *   Malvinas, con el nombre de cada país (en español e inglés).
 *   Natural Earth 1:10m y 1:50m (dominio público): https://www.naturalearthdata.com
 * - Capitales de cada provincia, región y departamento (para el clima por zona).
 * - Volcanes del Holoceno de Argentina, Chile, Bolivia y Perú: Global Volcanism Program,
 *   Smithsonian Institution (Volcanoes of the World, uso libre citando la fuente):
 *   https://volcano.si.edu
 *
 * - Ríos (líneas centrales de Natural Earth 1:10m, dominio público) de América del Sur.
 *   `node build.mjs --solo-rios` reemplaza solo los ríos en el archivo ya generado (sin volver a bajar volcanos ni provincias).
 *
 * Las geometrías se simplifican (Douglas-Peucker) y se redondean: el mapa es un
 * contorno de referencia, no cartografía de precisión.
 *
 * Uso: node tools/geo-data/build.mjs   (necesita conexión; el resultado se versiona)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const GVP =
  'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature' +
  '&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json';
const OUT = fileURLToPath(new URL('../../app/src/modules/weathermap/geo-data.json', import.meta.url));

const COUNTRIES = { ARG: 'AR', CHL: 'CL', URY: 'UY', BOL: 'BO', PER: 'PE' };
/** El resto de América del Sur (la Guayana Francesa sale del polígono de Francia). */
const NEIGHBORS = ['BRA', 'PRY', 'ECU', 'COL', 'VEN', 'GUY', 'SUR'];
/** Grados: ~1 km en provincias, ~4 km en el contorno de los vecinos. */
const TOLERANCE = 0.01;
const NEIGHBOR_TOLERANCE = 0.04;
/** Islotes más chicos que esto (grados²) no aportan a un mapa de referencia. */
const MIN_RING_AREA = 0.002;

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const r3 = (n) => Math.round(n * 1000) / 1000;

function perpDist([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(points[i], points[a], points[b]);
      if (d > max) [max, index] = [d, i];
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const area = (ring) => Math.abs(ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + x1 * y2 - x2 * y1;
}, 0)) / 2;

/** Polígono o multipolígono → anillos exteriores simplificados, como [lon, lat, lon, lat, …]. */
function rings(geometry, tolerance, minArea = MIN_RING_AREA) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys
    .map((poly) => poly[0])
    .filter((ring) => area(ring) >= minArea)
    .map((ring) => simplify(ring, tolerance))
    .filter((ring) => ring.length >= 4)
    .map((ring) => ring.flatMap(([lon, lat]) => [r3(lon), r3(lat)]));
}

/** Grados: ~2 km; un río es una línea de referencia. */
const RIVER_TOLERANCE = 0.02;
/** América del Sur: [oeste, sur, este, norte]. */
const SOUTH_AMERICA = [-83, -58, -33, 14];

/** Líneas centrales de ríos de Natural Earth → [{ name, rank, lines: [[lon, lat, lon, lat, …]] }]. `rank` 1 es el mayor. */
async function riversOf() {
  const data = await get(`${NE}/ne_10m_rivers_lake_centerlines.geojson`);
  const [w, so, e, n] = SOUTH_AMERICA;
  const inside = ([lon, lat]) => lon >= w && lon <= e && lat >= so && lat <= n;
  const out = [];
  for (const f of data.features) {
    if (f.properties.featurecla !== 'River') continue;
    const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    const lines = parts
      .filter((line) => line.some(inside))
      .map((line) => simplify(line, RIVER_TOLERANCE))
      .filter((line) => line.length >= 2)
      .map((line) => line.flatMap(([lon, lat]) => [r3(lon), r3(lat)]));
    if (lines.length) out.push({ name: f.properties.name ?? '', rank: f.properties.scalerank, lines });
  }
  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

if (process.argv.includes('--solo-rios')) {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(OUT, 'utf8'));
  data.rivers = await riversOf();
  await writeFile(OUT, JSON.stringify(data));
  console.log(`ríos: ${data.rivers.length} → ${OUT} (${JSON.stringify(data).length} bytes)`);
  process.exit(0);
}

const [admin1, admin0hi, places, admin0, volcanoes] = await Promise.all([
  get(`${NE}/ne_10m_admin_1_states_provinces.geojson`),
  get(`${NE}/ne_10m_admin_0_countries.geojson`),
  get(`${NE}/ne_10m_populated_places_simple.geojson`),
  get(`${NE}/ne_50m_admin_0_countries.geojson`),
  get(GVP),
]);

const regions = admin1.features
  .filter((f) => COUNTRIES[f.properties.adm0_a3])
  .map((f) => ({
    id: f.properties.iso_3166_2 || f.properties.adm1_code,
    country: COUNTRIES[f.properties.adm0_a3],
    name: f.properties.name,
    label: [r3(f.properties.longitude), r3(f.properties.latitude)],
    rings: rings(f.geometry, TOLERANCE),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Las Malvinas van con el resto del mapa (no como país vecino), con su nombre en español.
const flk = admin0.features.find((f) => f.properties.ADM0_A3 === 'FLK');
regions.push({ id: 'AR-MALVINAS', country: 'AR', name: 'Islas Malvinas', label: [-59.5, -51.75], rings: rings(flk.geometry, TOLERANCE) });

const label = (p) => [r3(p.LABEL_X), r3(p.LABEL_Y)];
const neighbors = admin0.features
  .filter((f) => NEIGHBORS.includes(f.properties.ADM0_A3))
  .map((f) => ({ code: f.properties.ISO_A2_EH, rings: rings(f.geometry, NEIGHBOR_TOLERANCE) }));
// Guayana Francesa: los polígonos de Francia que están en América del Sur.
const fra = admin0.features.find((f) => f.properties.ADM0_A3 === 'FRA');
const guiana = { type: 'MultiPolygon', coordinates: fra.geometry.coordinates.filter((poly) => poly[0].every(([lon, lat]) => lon < -50 && lon > -55 && lat > 1 && lat < 6.5)) };
neighbors.push({ code: 'GF', rings: rings(guiana, NEIGHBOR_TOLERANCE) });

/**
 * Frontera y costa de nuestros países, del mismo 1:10m que las provincias (así
 * coinciden con sus bordes), para dibujarlas de otro color que los límites
 * internos. Las Malvinas van con Argentina.
 */
// Solo las islas grandes (Chiloé, Tierra del Fuego, Malvinas…): las cientos de islitas de los
// canales del sur con línea gruesa forman una mancha; ya tienen su línea fina de provincia.
const BORDER_MIN_AREA = 0.05;
const borders = admin0hi.features
  .filter((f) => COUNTRIES[f.properties.ADM0_A3])
  .map((f) => ({ code: COUNTRIES[f.properties.ADM0_A3], rings: rings(f.geometry, TOLERANCE, BORDER_MIN_AREA) }));
borders.find((b) => b.code === 'AR').rings.push(...rings(flk.geometry, TOLERANCE, BORDER_MIN_AREA));

/** Nombre de cada país de América del Sur y dónde escribirlo. */
const countries = [
  ...admin0.features
    .filter((f) => COUNTRIES[f.properties.ADM0_A3] || NEIGHBORS.includes(f.properties.ADM0_A3))
    .map((f) => ({ code: f.properties.ISO_A2_EH, name: { es: f.properties.NAME_ES, en: f.properties.NAME_EN }, label: label(f.properties) })),
  { code: 'GF', name: { es: 'Guayana Francesa', en: 'French Guiana' }, label: [-53.2, 3.9] },
].sort((a, b) => a.code.localeCompare(b.code));

const capitals = places.features
  .filter((f) => COUNTRIES[f.properties.adm0_a3] && /Admin-[01] capital/.test(f.properties.featurecla))
  .map((f) => ({
    name: f.properties.name,
    country: COUNTRIES[f.properties.adm0_a3],
    national: f.properties.adm0cap === 1,
    lon: r3(f.properties.longitude),
    lat: r3(f.properties.latitude),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const volcanoRows = volcanoes.features
  .filter((f) => /Argentina|Chile|Bolivia|Peru/.test(f.properties.Country))
  .map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: p.Volcano_Number,
      name: p.Volcano_Name,
      lon: r3(lon),
      lat: r3(lat),
      elevation: p.Elevation ?? null,
      lastEruption: typeof p.Last_Eruption_Year === 'number' ? p.Last_Eruption_Year : null,
      type: p.Primary_Volcano_Type ?? null,
      country: p.Country,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const data = {
  source: 'Natural Earth (dominio público; provincias, contorno y ríos) · Global Volcanism Program, Smithsonian Institution',
  regions,
  neighbors,
  borders,
  countries,
  capitals,
  volcanoes: volcanoRows,
  rivers: await riversOf(),
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
const points = (rs) => rs.reduce((n, r) => n + r.length / 2, 0);
console.log(
  `regiones: ${regions.length} (${regions.reduce((n, r) => n + points(r.rings), 0)} puntos), vecinos: ${neighbors.length}, países: ${countries.length}, ` +
    `capitales: ${capitals.length}, volcanes: ${volcanoRows.length} → ${OUT} (${JSON.stringify(data).length} bytes)`,
);

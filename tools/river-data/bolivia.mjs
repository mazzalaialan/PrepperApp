// Catálogo de estaciones de los ríos y el lago Titicaca de Bolivia con coordenadas → app/public/data/rivers-BO.json.
// El «Reporte de niveles diarios» del SENAMHI Bolivia (PDF) no trae coordenadas. Se toman de dos lugares:
//  1. el mapa de pronóstico hidrológico del propio SENAMHI (https://senamhi.gob.bo/pronosticoH/index.html, lista `estacionesData`);
//  2. unas pocas estaciones que ese mapa no tiene, con la ubicación del pueblo o puente según OpenStreetMap (© OpenStreetMap
//     contributors, ODbL), marcadas `approx` (pueden estar a varios km de la escala).
// Una estación del PDF sin coordenadas se deja afuera. Uso: node tools/river-data/bolivia.mjs   (requiere `npm install --ignore-scripts` en esta carpeta)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { latestReportUrl, matchReadings, parseNiveles, pdfText } from '../../server/src/rivers/bo.ts';

const UA = { 'user-agent': 'VikArg-Prepping-Tools/1.0' };
const get = async (url) => {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
};
const round = (n) => Number(Number(n).toFixed(4));

// Estaciones del PDF que el mapa del SENAMHI no trae: ubicación aproximada (OpenStreetMap).
const APPROX = [
  { name: 'HUATAJATA', lat: -16.2089, lon: -68.7005, note: 'Huatajata (lago Titicaca)' },
  { name: 'ISLA DEL SOL', lat: -16.018, lon: -69.177, note: 'Isla del Sol (lago Titicaca)' },
  { name: 'AGUALLAMAYA', lat: -16.8106, lon: -68.9033, note: 'Aguallamaya (río Desaguadero)' },
  { name: 'PUENTE CHAUNACA', lat: -18.9906, lon: -65.4386, note: 'Chaunaca (río Ravelo)' },
  { name: 'TUMUSLA', lat: -20.4902, lon: -65.6193, note: 'Tumusla' },
  { name: 'CAMARGO', lat: -20.6413, lon: -65.2089, note: 'Camargo' },
  { name: 'GUANAY', lat: -15.4977, lon: -67.8798, note: 'Guanay' },
  { name: 'PUENTE SAPECHO', lat: -15.5588, lon: -67.3749, note: 'Puente Sapecho (río Beni)' },
];

const html = await (await get('https://senamhi.gob.bo/pronosticoH/index.html')).text();
const m = /estacionesData\s*=\s*(\[.*?\]);/s.exec(html);
if (!m) throw new Error('el mapa del SENAMHI cambió: no se encontró estacionesData');
const mapStations = JSON.parse(m[1]).filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number' && s.nombre);

const listUrl = latestReportUrl(await (await get('https://senamhi.gob.bo/hidrologia/rhidrologico')).text());
if (!listUrl) throw new Error('no se encontró el reporte de niveles');
const rows = parseNiveles(await pdfText(new Uint8Array(await (await get(listUrl)).arrayBuffer())));
console.log(`reporte ${listUrl}: ${rows.length} filas`);

const stations = [];
const seen = new Set();
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
for (const r of rows) {
  const key = norm(r.key.replace('-SNHN', ''));
  // La estación del PDF es el nombre del mapa con el que empieza la fila (el resto es el río).
  const hit = mapStations
    .map((s) => ({ s, k: norm(s.nombre.replace(/\s*\(sensor\)/i, '')) }))
    .filter(({ k }) => key === k || key.startsWith(`${k} `))
    .sort((a, b) => b.k.length - a.k.length)[0];
  if (hit && !seen.has(hit.k)) {
    seen.add(hit.k);
    stations.push({ name: hit.k, lat: round(hit.s.lat), lon: round(hit.s.lon), approx: false });
  }
}
for (const a of APPROX) {
  if (seen.has(a.name)) continue;
  if (!rows.some((r) => norm(r.key) === a.name || norm(r.key).startsWith(`${a.name} `))) continue;
  seen.add(a.name);
  stations.push({ name: a.name, lat: a.lat, lon: a.lon, approx: true });
}
stations.sort((a, b) => a.name.localeCompare(b.name));
const matched = matchReadings(rows, stations);
console.log(`${stations.length} estaciones con coordenadas (${stations.filter((s) => s.approx).length} aproximadas); ${matched.length} de ${rows.length} filas del reporte con ubicación`);
if (stations.length < 20) throw new Error('muy pocas estaciones: ¿cambió el formato?');

const file = fileURLToPath(new URL('../../app/public/data/rivers-BO.json', import.meta.url));
writeFileSync(
  file,
  JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'SENAMHI Bolivia, reporte de niveles diarios; ubicación de las estaciones del mapa de pronóstico del SENAMHI y, las marcadas como aproximadas, de OpenStreetMap (© OpenStreetMap contributors)',
    stations,
  }) + '\n',
);
console.log(`→ ${file}`);

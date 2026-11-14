// Catálogo de estaciones de ríos de Argentina con sus niveles de alerta → app/public/data/rivers-AR.json.
// Fuente: INA, Alerta Hidrológico (API a5, https://alerta.ina.gob.ar/a5/). Solo las estaciones argentinas, públicas, con al menos
// un umbral propio (nivel de alerta, de evacuación o de aguas bajas) y con altura medida en los últimos 30 días.
// Los niveles de los ríos de montaña sin umbral no se incluyen: sin un nivel de referencia no se puede decir si es mucho o poco.
// Uso: node tools/river-data/build.mjs   (una consulta por estación, con pausa: ~2 minutos)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://alerta.ina.gob.ar/a5/obs/puntual';
const UA = { 'user-agent': 'VikArg-Prepping-Tools/1.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d) => (n === null || n === undefined ? null : Number(Number(n).toFixed(d)));

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await sleep(5000 * i);
    }
  }
}

/** Los códigos de río del INA, con su nombre legible. */
const RIVERS = {
  PARANAMED: 'Paraná medio',
  PARANAINF: 'Paraná inferior',
  PARANADELASPALMAS: 'Paraná de las Palmas',
  'Paraná de las Palmas': 'Paraná de las Palmas',
  Paraná: 'Paraná',
  URUGUAY: 'Uruguay',
  PARAGUAY: 'Paraguay',
  IGUAZU: 'Iguazú',
  RIODELAPLATA: 'Río de la Plata',
  'Río de la Plata': 'Río de la Plata',
  LUJAN: 'Luján',
  SALADOSANTAFE: 'Salado (Santa Fe)',
  BARRANQUERAS: 'Paraná (Barranqueras)',
  GUALEGUAYCHU: 'Gualeguaychú',
};
const riverName = (code) => (code ? (RIVERS[code] ?? code.charAt(0) + code.slice(1).toLowerCase()) : '');

const stations = (await getJson(`${BASE}/estaciones`)).filter(
  (e) =>
    e.pais === 'Argentina' &&
    e.public !== false &&
    e.red?.public !== false &&
    e.geom?.coordinates &&
    [e.nivel_alerta, e.nivel_evacuacion, e.nivel_aguas_bajas].some((v) => v !== null && v !== undefined),
);
console.log(`${stations.length} estaciones con umbrales`);

const out = [];
for (const e of stations) {
  await sleep(700);
  // Altura hidrométrica (variable 2) medida (procedimiento 1) de esa estación.
  const { rows } = await getJson(`${BASE}/series?var_id=2&proc_id=1&estacion_id=${e.id}`);
  const s = rows?.[0];
  const last = s?.date_range?.timeend ? Date.parse(`${s.date_range.timeend}Z`) : 0;
  if (!s || Date.now() - last > 30 * 86_400_000) {
    console.log(`  sin dato reciente: ${e.nombre} (${e.id})`);
    continue;
  }
  out.push({
    id: e.id,
    name: e.nombre,
    river: riverName(e.rio),
    province: e.provincia ?? '',
    lat: round(e.geom.coordinates[1], 4),
    lon: round(e.geom.coordinates[0], 4),
    alert: round(e.nivel_alerta, 2),
    evac: round(e.nivel_evacuacion, 2),
    low: round(e.nivel_aguas_bajas, 2),
    series: s.id,
  });
}
out.sort((a, b) => a.river.localeCompare(b.river) || a.name.localeCompare(b.name));
if (out.length < 40) throw new Error(`muy pocas estaciones (${out.length}): ¿cambió la API?`);

const file = fileURLToPath(new URL('../../app/public/data/rivers-AR.json', import.meta.url));
writeFileSync(
  file,
  JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'INA, Alerta Hidrológico (alerta.ina.gob.ar): escalas de Prefectura Naval y Red Hidrológica Nacional',
    stations: out,
  }) + '\n',
);
console.log(`${out.length} estaciones → ${file}`);

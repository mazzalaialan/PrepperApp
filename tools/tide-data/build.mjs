// Constantes armónicas de mareas para las estaciones de Argentina, Chile, Uruguay, Bolivia y Perú → app/public/data/tides.json.
// Fuente: @neaps/tide-database (MIT), que para estas estaciones trae las constantes TICON-4 (CC BY 4.0; uso comercial permitido).
// Uso: cd tools/tide-data && npm install --ignore-scripts && node build.mjs
// La app calcula las mareas sin conexión con @neaps/tide-predictor (MIT). Uruguay y Bolivia no tienen estaciones.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stations } from '@neaps/tide-database';

const COUNTRIES = new Set(['AR', 'CL', 'UY', 'BO', 'PE']);
const round = (n, d) => Number(n.toFixed(d));

const out = [];
for (const s of stations) {
  if (!COUNTRIES.has(s.country_code) || s.kind !== 'tide') continue;
  const constituents = s.harmonic_constituents ?? [];
  // Las «subordinadas» no traen constantes propias (solo diferencias con otra estación): no se usan.
  if (s.type !== 'reference' || constituents.length < 8) continue;
  const datums = s.datums ?? {};
  out.push({
    id: s.id,
    name: s.name,
    country: s.country_code,
    lat: round(s.latitude, 4),
    lon: round(s.longitude, 4),
    timezone: s.timezone,
    source: s.source?.name ?? '',
    license: s.license?.type ?? '',
    // Avisos de calidad de la base (por ejemplo, datos viejos o pocos años de medición).
    issues: s.quality?.issues ?? [],
    // Niveles de referencia (m, sobre el cero del mareógrafo): nivel medio y los extremos astronómicos.
    datums: Object.fromEntries(['MSL', 'LAT', 'HAT'].filter((k) => typeof datums[k] === 'number').map((k) => [k, round(datums[k], 3)])),
    // [nombre, amplitud (m), fase (° UTC)]
    constituents: constituents.map((c) => [c.name, round(c.amplitude, 4), round(c.phase, 2)]),
  });
}
out.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
if (out.length < 15) throw new Error(`muy pocas estaciones (${out.length}): ¿cambió el formato de la base?`);

const file = fileURLToPath(new URL('../../app/public/data/tides.json', import.meta.url));
writeFileSync(
  file,
  JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Constantes armónicas TICON-4 (Hart-Davis, Dettmering y Seitz, 2025; SEANOE, doi 10.17882/109129; CC BY 4.0) a través de la base abierta Neaps (MIT). Se modificó el formato.',
    stations: out,
  }) + '\n',
);
console.log(`${out.length} estaciones → ${file}`);

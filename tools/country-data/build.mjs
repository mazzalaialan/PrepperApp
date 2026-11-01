#!/usr/bin/env node
/**
 * Genera los paquetes de datos sin conexión de Chile y Uruguay:
 * app/public/data/CL.json y UY.json. No van en la descarga inicial de la app:
 * se bajan una vez al elegir el país (ver app/src/modules/emergency/country.ts).
 *
 * - Localidades: GeoNames (CC BY 4.0), con población, para la detección de
 *   ciudad o zona agreste y para ubicar lugares por nombre.
 * - Bomberos, policía y centros de salud: OpenStreetMap (ODbL), vía Overpass.
 * - Radios: Radiodifusión Nacional del Uruguay (Radio Uruguay y su red del
 *   interior) y la red de Radio Bío-Bío en Chile (privada, de cobertura nacional:
 *   Chile no tiene radio pública), ubicadas con GeoNames.
 *
 * Uso: node tools/country-data/build.mjs   (necesita conexión; el resultado se versiona)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { unzipSync, strFromU8 } = require('fflate');

const OUT_DIR = fileURLToPath(new URL('../../app/public/data/', import.meta.url));
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/PrepperApp)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

/** Radio Uruguay (Radiodifusión Nacional del Uruguay): Montevideo y repetidoras FM del interior. */
const RADIO_UY = [
  ['CX26 Radio Uruguay', 'Montevideo', 1050, 94.7],
  ['CX254 Radio Uruguay', 'Artigas', null, 98.7],
  ['CX261B Radio Uruguay', 'Bella Unión', null, 100.1],
  ['CX274B Radio Uruguay', 'Carmelo', null, 102.7],
  // Chuy no está en GeoNames de Uruguay: ubicación a mano (Chuy, Rocha).
  ['CX228 Radio Uruguay', 'Chuy', null, 93.5, { lat: -33.697, lon: -53.456, province: 'Rocha' }],
  ['CX280 Radio Uruguay', 'Colonia del Sacramento', null, 103.9],
  ['CX286 Radio Uruguay', 'Durazno', null, 105.1],
  ['CX241A Radio Uruguay', 'Florida', null, 96.1],
  ['CX275B Radio Uruguay', 'Fray Bentos', null, 102.9],
  ['CX295 Radio Uruguay', 'Melo', null, 106.9],
  ['CX221 Radio Uruguay', 'Mercedes', null, 92.1],
  ['CX291A Radio Uruguay', 'Minas', null, 106.1],
  ['CX291 Radio Uruguay', 'Paso de los Toros', null, 106.1],
  ['CX278A Radio Uruguay', 'Paysandú', null, 103.5],
  ['CX230 Radio Uruguay', 'Rivera', null, 93.9],
  ['CX299 Radio Uruguay', 'Rocha', null, 107.7],
  ['CX282 Radio Uruguay', 'Salto', null, 104.3],
  ['CX236D Radio Uruguay', 'San José de Mayo', null, 95.1],
  ['CX279 Radio Uruguay', 'Tacuarembó', null, 103.7],
  ['CX224 Radio Uruguay', 'Treinta y Tres', null, 92.7],
];

/** Red de Radio Bío-Bío (es.wikipedia.org/wiki/Radio_Bío-Bío). */
const RADIO_CL = [
  ['Santiago', null, 99.7],
  ['Arica', null, 92.7],
  ['Iquique', null, 96.9],
  ['Calama', null, 100.7],
  ['Antofagasta', null, 93.5],
  ['Caldera', null, 96.9],
  ['Copiapó', null, 97.3],
  ['Vallenar', null, 89.7],
  ['La Serena', null, 90.5],
  ['Ovalle', null, 101.1],
  ['Los Andes', null, 103.5],
  ['Valparaíso', null, 94.5],
  ['Casablanca', null, 93.5],
  ['San Antonio', null, 106.1],
  ['Curacaví', null, 95.1],
  ['Melipilla', null, 89.9],
  ['Rancagua', null, 99.9],
  ['Vichuquén', null, 100.3],
  ['Curicó', null, 98.5],
  ['Constitución', null, 106.1],
  ['Talca', null, 96.9],
  ['Longaví', null, 97.3],
  ['Chillán', null, 105.3],
  ['Cañete', null, 97.7],
  ['Lebu', null, 103.5],
  ['Concepción', 620, 98.1],
  ['Los Ángeles', null, 96.7],
  ['Angol', null, 99.7],
  ['Lonquimay', null, 101.5],
  ['Temuco', null, 88.1],
  ['Pucón', null, 103.7],
  ['Villarrica', null, 88.5],
  ['Valdivia', null, 88.9],
  ['Los Lagos', null, 91.5],
  ['Osorno', null, 106.5],
  ['Puerto Varas', null, 88.9],
  ['Puerto Montt', null, 94.9],
  ['Ancud', null, 99.3],
  ['Castro', null, 89.3],
  ['Quellón', null, 93.7],
  ['Coyhaique', null, 90.3],
  ['Punta Arenas', null, 105.1],
].map(([city, am, fm]) => ['Radio Bío-Bío', city, am, fm]);

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function getBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Localidades con población (o cabeceras) de GeoNames. */
async function geonames(cc, admin1) {
  const zip = unzipSync(await getBytes(`https://download.geonames.org/export/dump/${cc}.zip`));
  const rows = strFromU8(zip[`${cc}.txt`]).split('\n');
  const SKIP = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLX', 'PPLCH']);
  const provinces = new Set();
  const places = [];
  // Todos los lugares poblados (también sin población), solo para ubicar radios por nombre.
  const all = [];
  for (const line of rows) {
    const f = line.split('\t');
    if (f[6] !== 'P' || SKIP.has(f[7])) continue;
    const population = Number(f[14]) || 0;
    const seat = /^PPL(A\d?|C)$/.test(f[7]);
    all.push([f[1], f[10], Math.round(Number(f[4]) * 1e3) / 1e3, Math.round(Number(f[5]) * 1e3) / 1e3, population]);
    if (population === 0 && !seat) continue;
    const province = admin1.get(`${cc}.${f[10]}`) ?? '';
    provinces.add(province);
    // Misma escala que el nomenclátor argentino: 2000 = localidad; +población; cabeceras +500.
    const rank = 2000 + population + (seat ? 500 : 0);
    places.push({ name: f[1], province, lat: Math.round(Number(f[4]) * 1e3) / 1e3, lon: Math.round(Number(f[5]) * 1e3) / 1e3, rank });
  }
  const provList = [...provinces].sort();
  places.sort((a, b) => b.rank - a.rank);
  return {
    provinces: provList,
    places: places.map((p) => [p.name, provList.indexOf(p.province), p.lat, p.lon, p.rank]),
    // [nombre, provincia (nombre), lat, lon]: el de más población primero.
    all: all.sort((a, b) => b[4] - a[4]).map(([n, a1, lat, lon]) => [n, admin1.get(`${cc}.${a1}`) ?? '', lat, lon]),
  };
}

async function admin1Names() {
  const text = new TextDecoder().decode(await getBytes('https://download.geonames.org/export/dump/admin1CodesASCII.txt'));
  return new Map(
    text
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t'))
      .map((f) => [f[0], f[1]]),
  );
}

async function overpass(cc) {
  const query = `[out:json][timeout:300];
area["ISO3166-1"="${cc}"][admin_level=2]->.a;
(
  nwr["amenity"="fire_station"](area.a);
  nwr["amenity"="police"](area.a);
  nwr["amenity"~"^(hospital|clinic)$"](area.a);
  nwr["healthcare"~"^(hospital|clinic|centre)$"](area.a);
);
out center tags;`;
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()).elements;
    } catch (err) {
      console.warn(`Overpass ${endpoint}: ${err.message}`);
    }
  }
  throw new Error('Overpass no respondió');
}

function toPlace(e, fallbackName) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const address = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
  const place = { name: t.name ?? t.official_name ?? fallbackName, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  const phone = t.phone ?? t['contact:phone'] ?? t.emergency_phone;
  if (phone) place.phone = phone;
  if (address) place.address = address;
  return place;
}

function radios(list, all) {
  const out = [];
  for (const [call, city, am, fm, fixed] of list) {
    if (fixed) {
      out.push({ call, city, am, fm, ...fixed });
      continue;
    }
    const n = norm(city);
    const hit = all.find((p) => norm(p[0]) === n) ?? all.find((p) => norm(p[0]).startsWith(n));
    if (!hit) {
      console.warn(`Sin ubicación para la radio de ${city}`);
      continue;
    }
    out.push({ call, city, province: hit[1], am, fm, lat: hit[2], lon: hit[3] });
  }
  return out;
}

async function build(cc, radioList, labels) {
  const admin1 = await admin1Names();
  const { provinces, places, all } = await geonames(cc, admin1);
  const elements = await overpass(cc);
  const fire = [];
  const police = [];
  const health = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (t.amenity === 'fire_station') fire.push(toPlace(e, labels.fire));
    else if (t.amenity === 'police') police.push(toPlace(e, labels.police));
    else {
      const place = toPlace(e, labels.health);
      // Hospitales aparte de los centros de atención primaria (como en los datos argentinos).
      if (place && (t.amenity === 'hospital' || t.healthcare === 'hospital')) place.type = 'Hospital';
      health.push(place);
    }
  }
  const data = {
    country: cc,
    generatedAt: new Date().toISOString().slice(0, 10),
    // Los lugares vienen de OpenStreetMap (no de un listado oficial).
    osm: true,
    sources: {
      fire: 'OpenStreetMap (ODbL)',
      police: 'OpenStreetMap (ODbL)',
      health: 'OpenStreetMap (ODbL)',
      radio: labels.radioSource,
      places: 'GeoNames (CC BY 4.0)',
    },
    fire: fire.filter(Boolean),
    police: police.filter(Boolean),
    health: health.filter(Boolean),
    radio: radios(radioList, all),
    provinces,
    places,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}${cc}.json`, JSON.stringify(data));
  console.log(
    `${cc}: ${data.fire.length} bomberos, ${data.police.length} policía, ${data.health.length} salud, ${data.radio.length} radios, ${places.length} localidades`,
  );
}

await build('UY', RADIO_UY, { fire: 'Bomberos', police: 'Policía', health: 'Centro de salud', radioSource: 'Radiodifusión Nacional del Uruguay (Wikipedia)' });
await build('CL', RADIO_CL, { fire: 'Bomberos', police: 'Carabineros', health: 'Centro de salud', radioSource: 'Radio Bío-Bío (Wikipedia)' });

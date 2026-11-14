// Catálogo de mareógrafos medidos del IOC (Sea Level Station Monitoring Facility) → app/public/data/ioc-stations.json.
// Qué estaciones de Sudamérica reportaron en los últimos 7 días: la lista de estaciones es pública, pero la fecha del último dato
// (`/v2/stations/shortlist`) pide la clave. Sin licencia comercial: ver navigation/sources.ts (fuente 'ioc').
// Uso: IOC_API_KEY=... node ioc.mjs   (o sin la variable: la lee de ~/vikarg/deploy/.env)
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const COUNTRIES = new Set(['ARG', 'CHL', 'URY', 'PER', 'BOL', 'ECU', 'BRA', 'COL', 'PRY', 'FLK']);
const MAX_AGE_MS = 7 * 86_400_000;

function key() {
  if (process.env.IOC_API_KEY) return process.env.IOC_API_KEY;
  const env = readFileSync(`${homedir()}/vikarg/deploy/.env`, 'utf8');
  return /^IOC_API_KEY=(.+)$/m.exec(env)?.[1]?.trim();
}
const apiKey = key();
if (!apiKey) throw new Error('falta IOC_API_KEY');

const list = await (await fetch('https://www.ioc-sealevelmonitoring.org/service.php?query=stationlist&showall=all')).json();
const short = await (await fetch('https://api.ioc-sealevelmonitoring.org/v2/stations/shortlist?limit=5000', { headers: { 'X-API-KEY': apiKey } })).json();
const last = new Map(short.map((s) => [s.Code, s.lasttime]));

const out = [];
const seen = new Set();
for (const s of list) {
  if (!COUNTRIES.has(s.country) || seen.has(s.Code) || s.Lat == null || s.Lon == null) continue;
  const t = last.get(s.Code);
  if (!t || Date.now() - Date.parse(t.replace(' ', 'T') + 'Z') > MAX_AGE_MS) continue;
  if (/DART/i.test(s.Location)) continue;
  seen.add(s.Code);
  out.push({ code: s.Code, name: String(s.Location).replace(/_[A-Z]{2}$/, '').trim(), country: s.country, lat: Number(s.Lat.toFixed(4)), lon: Number(s.Lon.toFixed(4)), operator: String(s.localoperator ?? '').replace(/\s+/g, ' ').trim() });
}
out.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
const file = fileURLToPath(new URL('../../app/public/data/ioc-stations.json', import.meta.url));
writeFileSync(file, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: 'IOC SLSMF (VLIZ), doi 10.14284/482', stations: out }) + '\n');
console.log(out.length, 'estaciones');
const byCountry = {};
for (const s of out) byCountry[s.country] = (byCountry[s.country] ?? 0) + 1;
console.log(byCountry);

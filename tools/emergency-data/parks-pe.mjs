#!/usr/bin/env node
/**
 * Áreas naturales protegidas nacionales de Perú (SERNANP) para usar sin
 * conexión: app/public/data/parks-PE.json (se baja aparte, como el de Chile).
 *
 * - Límites: servicio de descarga del SERNANP (ArcGIS, capa "ANP Nacional
 *   Definitiva": una fila por sector), simplificados y agrupados por área.
 *   Términos del visor (geo.sernanp.gob.pe, leídos el 2026-11-08): la
 *   información es de dominio público y se autorizan los mapas derivados
 *   citando al SERNANP como fuente; no se redistribuyen los datos originales
 *   (por eso van simplificados). VikArg es gratuito y sin fines de lucro.
 * - Contacto: la oficina y el teléfono de cada jefatura, del «Directorio de jefes
 *   de ANP» del SERNANP (junio de 2024; ver parks-pe-contacts.mjs; sin nombres ni
 *   correos). Las áreas sin teléfono publicado quedan con la sede central.
 * - No se incluyen las áreas de conservación privadas: la capa trae el
 *   nombre del titular (personas), que no corresponde mostrar.
 *
 * Uso: node tools/emergency-data/parks-pe.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { centerOf, r4, ringArea, simplified } from '../lib/osm-geo.mjs';
import { contactFor } from './parks-pe-contacts.mjs';

// Con VIKARG_DATA_OUT escribe en la carpeta que sirve el servidor (actualización mensual).
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/parks-PE.json` : fileURLToPath(new URL('../../app/public/data/parks-PE.json', import.meta.url));
const LAYER = 'https://geoservicios.sernanp.gob.pe/arcgis/rest/services/sernanp_visor/servicio_descarga/MapServer/1/query';
const PAGE = 'https://www.gob.pe/institucion/sernanp/sedes';
const EMERGENCY = [{ label: 'SERNANP (sede central, Lima)', phone: '920 201 317' }];

const params = new URLSearchParams({
  where: '1=1',
  outFields: 'anp_codi,anp_cate,anp_nomb',
  returnGeometry: 'true',
  outSR: '4326',
  // ≈ 330 m, como Bolivia; el servicio simplifica en el servidor y la respuesta pesa unos 150 KB.
  maxAllowableOffset: '0.003',
  geometryPrecision: '4',
  f: 'geojson',
});
const res = await fetch(`${LAYER}?${params}`, { headers: { 'User-Agent': 'VikArg-Prepping-Tools/1.0' }, signal: AbortSignal.timeout(120_000) });
if (!res.ok) throw new Error(`SERNANP: ${res.status}`);
const { features } = await res.json();
if (!Array.isArray(features) || features.length < 50) throw new Error(`SERNANP: respuesta inesperada (${features?.length} filas)`);

// Una fila por sector: se agrupan por código del área.
const groups = new Map();
for (const f of features) {
  const p = f.properties ?? {};
  if (!p.anp_codi || !p.anp_nomb || !f.geometry) continue;
  const g = groups.get(p.anp_codi) ?? { name: `${p.anp_cate} ${p.anp_nomb}`.replace(/\s+/g, ' ').trim(), polys: [] };
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  g.polys.push(...polys);
  groups.set(p.anp_codi, g);
}

const parks = [];
for (const [code, g] of groups) {
  const area = simplified(g.polys.map((poly) => poly.map((ring) => ring.map(([x, y]) => [r4(x), r4(y)]))), 0, 1e-8).filter((poly) => ringArea(poly[0]) > 0);
  const at = centerOf(area);
  if (!at) continue;
  const c = contactFor(g.name);
  parks.push({ country: 'PE', name: g.name, url: `${PAGE}#${code}`, office: c ? `SERNANP: jefatura del área` : 'SERNANP', address: c?.[1] ?? '', phone: c?.[2] ?? '', phones: '', emergency: EMERGENCY, lat: at.lat, lon: at.lon, area });
}
parks.sort((a, b) => a.name.localeCompare(b.name, 'es'));

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Límites: SERNANP (MINAM), mapa derivado y simplificado (geo.sernanp.gob.pe). Contacto: directorio de jefes de ANP del SERNANP (junio de 2024) y sede central (gob.pe/sernanp).',
  parks,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${parks.length} áreas (de ${features.length} filas) → ${OUT} (${JSON.stringify(data).length} bytes)`);

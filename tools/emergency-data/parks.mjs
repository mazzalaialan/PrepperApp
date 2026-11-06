#!/usr/bin/env node
/**
 * Parques nacionales para usar sin conexión:
 * app/src/modules/emergency/parks-data.json
 *
 * - Límites: capa "Área protegida" del IGN (WFS, CC BY 4.0), solo jurisdicción
 *   nacional; simplificados (~150 m) para que pesen poco.
 * - Intendencia, dirección y teléfonos: página de cada área en
 *   argentina.gob.ar/parquesnacionales (CC BY 4.0), relevadas el 2026-11-05.
 *   Se copian a mano en PARKS (las páginas no tienen un formato fijo).
 * - Frecuencias VHF: solo las que el propio parque publica para visitantes
 *   (mapas, folletos o carteles), con su fuente. No se supone que una frecuencia
 *   vale en un parque si no está publicada para ese parque.
 * - Ubicación de la intendencia: Nominatim (OpenStreetMap), por localidad, al generar.
 *
 * Uso: node tools/emergency-data/parks.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/src/modules/emergency/parks-data.json', import.meta.url));
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/PrepperApp)';
const IGN = 'https://wms.ign.gob.ar/geoserver/ows?service=wfs&version=2.0.0&request=GetFeature&outputFormat=application/json&count=20000&typeNames=ign:area_protegida';
const APN = 'https://www.argentina.gob.ar/parquesnacionales/';

const VLA_MAP = 'Mapa de trekking de Villa La Angostura ("VHF de Emergencia APN")';
const PAMPA_LINDA = 'PN Nahuel Huapi, hoja "Sendas de trekking desde Pampa Linda" (2022)';
const LANIN_SIGNS = 'Carteles del PN Lanín (base del volcán, intendencia y Cerro Colorado), vistos en 2026';
const APN_EMERGENCY = (source) => ({ freq: '155,675 MHz', label: 'VHF de emergencia de Parques Nacionales', source });

/**
 * Áreas de Parques Nacionales con su página. `ign`: nombres de los polígonos
 * del IGN que le corresponden (parque y reserva). `town`: localidad de la
 * intendencia, para ubicarla. `phone`: el número para llamar; `phones`: el
 * texto completo de la página (internos, otros números).
 */
const PARKS = [
  { name: 'Parque Nacional Aconquija', url: 'region-noroeste/parque-nacional-aconquija', ign: ['Parque Nacional Aconquija'], town: 'Concepción, Tucumán', address: 'Raúl Alfonsín 1400, Concepción, Tucumán', phone: '03865 15-358562', phones: '03865-15358562 (visitantes y uso público)' },
  { name: 'Parque Nacional Baritú', url: 'region-noroeste/parque-nacional-baritu', ign: ['Parque Nacional Baritú'], town: 'Los Toldos, Salta', address: 'Sandalio Quispe s/n, Los Toldos, Salta', phone: '0387 507-4433', phones: '0387-5074433 / 03878-511826' },
  { name: 'Reserva Nacional El Nogalar de los Toldos', url: 'region-noroeste/reserva-nacional-el-nogalar-de-los-toldos', ign: ['Reserva Nacional El Nogalar de los Toldos'], town: 'Los Toldos, Salta', address: 'Sandalio Quispe s/n, Los Toldos, Salta (intendencia del PN Baritú)', phone: '0387 507-4433', phones: '0387-5074433 / 03878-511826' },
  { name: 'Parque Nacional Calilegua', url: 'region-noroeste/parque-nacional-calilegua', ign: ['Parque Nacional Calilegua'], town: 'Calilegua, Jujuy', address: 'Marinero A. López s/n, Calilegua, Jujuy', phone: '03886 57-8465', phones: '03886-578465' },
  { name: 'Parque Nacional Copo', url: 'region-noroeste/parque-nacional-copo', ign: ['Parque Nacional y Reserva Provincial Copo'], town: 'Pampa de los Guanacos, Santiago del Estero', address: 'Ruta Nacional 16, acceso Francisco Solano 20, Pampa de los Guanacos, Santiago del Estero', phone: '03841 40-0606', phones: '03841-400-606' },
  { name: 'Parque Nacional El Rey', url: 'region-noroeste/parque-nacional-el-rey', ign: ['Parque Nacional El Rey'], town: 'Salta, Salta', address: 'Marcelo T. de Alvear 884, 2.º piso, Salta', phone: '0387 413-6046', phones: '0387-413-6046' },
  { name: 'Parque Nacional Los Cardones', url: 'region-noroeste/parque-nacional-los-cardones', ign: ['Parque Nacional Los Cardones'], town: 'Payogasta, Salta', address: 'Ruta Nacional 40 km 4510, Barrio Nuevo, Payogasta, Cachi, Salta', phone: '03868 49-6780', phones: '03868-496-780 · mesa de entradas 03868-15-452-880' },
  { name: 'Reserva Nacional Pizarro', url: 'region-noroeste/reserva-nacional-pizarro', ign: ['Reserva Nacional Pizarro'], town: 'General Pizarro, Salta', address: 'La Rioja y Vicente López y Planes, General Pizarro, Salta' },
  { name: 'Monumento Natural Laguna de los Pozuelos', url: 'region-noroeste/monumento-natural-laguna-de-los-pozuelos', ign: ['Sitio RAMSAR y Monumento Natural Laguna de los Pozuelos'], town: 'Abra Pampa, Jujuy', address: 'Pellegrini 120, Abra Pampa, Jujuy', phone: '03883 30-2000', phones: '011 4383-0964 int. 59001 / 03883 302000' },
  { name: 'Parque Nacional Ansenuza', url: 'centro/parque-nacional-ansenuza', ign: ['Parque Nacional Ansenuza', 'Reserva Nacional  Ansenuza'], town: 'Miramar de Ansenuza, Córdoba', address: '' },
  { name: 'Parque Nacional Campos del Tuyú', url: 'centro/parque-nacional-campos-del-tuyu', ign: ['Parque Nacional Campos del Tuyú'], town: 'General Lavalle, Buenos Aires', address: 'Manuel Lainez 1171, General Lavalle, Buenos Aires', phone: '02252 49-1085', phones: '02252-491-085' },
  { name: 'Parque Nacional Ciervo de los Pantanos', url: 'centro/parque-nacional-ciervo-de-los-pantanos', ign: ['Parque Nacional Ciervo de los Pantanos'], town: 'Otamendi, Campana, Buenos Aires', address: 'Rómulo Otamendi 1127, Otamendi, Campana, Buenos Aires' },
  { name: 'Parque Nacional El Leoncito', url: 'centro/parque-nacional-el-leoncito', ign: ['Parque Nacional El Leoncito'], town: 'Barreal, San Juan', address: 'San Martín Oeste 223, Barreal, Calingasta, San Juan', phone: '02648 44-1240', phones: '02648 441240 / 264-6304495' },
  { name: 'Parque Nacional El Palmar', url: 'centro/parque-nacional-el-palmar', ign: ['Parque Nacional El Palmar'], town: 'Ubajay, Entre Ríos', address: 'Portada del parque, Ruta Nacional 14 km 198, Ubajay, Entre Ríos' },
  { name: 'Parque Nacional Islas de Santa Fe', url: 'centro/parque-nacional-islas-de-santa-fe', ign: ['Parque Nacional Islas de Santa Fe'], town: 'Puerto Gaboto, Santa Fe', address: 'Av. Alameda 1530 esq. Almagro, Puerto Gaboto, Santa Fe', phone: '011 3985-3800', phones: '011 3985-3800 int. 60001' },
  { name: 'Parque Nacional Pre-Delta', url: 'centro/parque-nacional-pre-delta', ign: ['Parque Nacional Pre-Delta'], town: 'Diamante, Entre Ríos', address: '3 de Febrero 394, Diamante, Entre Ríos', phone: '0343 498-3535', phones: '0343-4983535' },
  { name: 'Parque Nacional Quebrada del Condorito', url: 'centro/parque-nacional-quebrada-del-condorito', ign: ['Parque Nacional Quebrada del Condorito', 'Reserva Nacional Quebrada del Condorito'], town: 'Villa Carlos Paz, Córdoba', address: 'Av. J. S. Bach 504 esq. Drago, B.º Costa Azul, Villa Carlos Paz, Córdoba', phone: '03541 53-2153', phones: '03541 532-153 (días hábiles, horario administrativo)' },
  { name: 'Parque Nacional San Guillermo', url: 'centro/parque-nacional-san-guillermo', ign: ['Parque Nacional San Guillermo'], town: 'Rodeo, San Juan', address: 'La Colonia s/n, Rodeo, San Juan', phone: '02647 15-406307', phones: '02647-15406307' },
  { name: 'Parque Nacional Sierra de las Quijadas', url: 'centro/parque-nacional-sierra-de-las-quijadas', ign: ['Parque Nacional Sierra de las Quijadas'], town: 'San Luis, San Luis', address: 'Junín 1460, San Luis', phone: '0266 473-2762', phones: '0266-473-2762' },
  { name: 'Parque Nacional Talampaya', url: 'centro/parque-nacional-talampaya', ign: ['Parque Nacional Talampaya'], town: 'Villa Unión, La Rioja', address: 'Av. Nicolás Dávila entre San Martín e Ing. Lorenz, Villa Unión, La Rioja', phone: '03825 47-0356', phones: '03825-470356' },
  { name: 'Parque Nacional Traslasierra', url: 'centro/parque-nacional-traslasierra', ign: ['Parque Nacional Traslasierra'], town: 'Villa de Soto, Córdoba', address: 'Aristóbulo del Valle 7, Villa de Soto, Córdoba', phone: '03541 15-243403', phones: '(03541) 15243403' },
  { name: 'Reserva Natural Educativa Cerro Pistarini', url: 'centro/reserva-natural-educativa-cerro-pistarini', ign: ['Reserva Natural Educativa Cerro Pistarini'], town: 'Río Tercero, Córdoba', address: '', phone: '3571 51-0276', phones: '3571510276 (teléfono y WhatsApp)' },
  { name: 'Parque Federal Campo San Juan', url: 'nea/parque-federal-campo-san-juan', ign: ['Reserva Natural Silvestre Parque Federal Campo San Juan'], town: 'Santa Ana, Misiones', address: 'Av. San Martín s/n y Hadad, Santa Ana, Misiones', phone: '011 3985-3800', phones: '011 3985-3800 int. 76001 (intendencia) / 76002 (destacamento) · WhatsApp +54 9 3764 31-5368', emergency: [{ label: 'Emergencias', phone: '+54 9 3764 55-9600' }] },
  { name: 'Parque Nacional Chaco', url: 'nea/parque-nacional-chaco', ign: ['Parque Nacional Chaco'], town: 'Capitán Solari, Chaco', address: 'José Ramón Fernández y Soldado Modesto Galarza, Capitán Solari, Chaco', phone: '03725 49-9161', phones: '03725-499-161' },
  { name: 'Parque Nacional El Impenetrable', url: 'nea/parque-nacional-el-impenetrable', ign: ['Parque Nacional El Impenetrable'], town: 'Miraflores, Chaco', address: 'Av. San Martín esq. Celso Páez, Miraflores, Chaco', phone: '03644 20-1831', phones: '03644-201831' },
  { name: 'Parque Nacional Iberá', url: 'nea/parque-nacional-ibera', ign: ['Parque Nacional Iberá', 'Reserva Nacional Iberá', 'Parque y Reserva Nacional Iberá'], town: 'Mercedes, Corrientes', address: 'M. J. Gómez 1250 (ex estación del ferrocarril), Mercedes, Corrientes', phone: '011 3985-3800', phones: '011 3985-3800 int. 75001' },
  { name: 'Parque Nacional Iguazú', url: 'nea/parque-nacional-iguazu', ign: ['Parque Nacional Iguazú', 'Reserva Nacional Iguazú'], town: 'Puerto Iguazú, Misiones', address: 'Victoria Aguirre 66, Puerto Iguazú, Misiones', phone: '03757 42-0722', phones: '03757-420-722 / 03757-423-915', emergency: [{ label: 'Centro Operativo Cataratas (WhatsApp)', phone: '3757 41-6370' }] },
  { name: 'Parque Nacional Laguna El Palmar', url: 'nea/parque-nacional-laguna-el-palmar', ign: ['Parque y Reserva Nacional Laguna El Palmar'], town: 'Colonia Elisa, Chaco', address: '' },
  { name: 'Parque Nacional Mburucuyá', url: 'nea/parque-nacional-mburucuya', ign: ['Parque Nacional Mburucuyá'], town: 'Mburucuyá, Corrientes', address: 'Belgrano 997, Mburucuyá, Corrientes', phone: '03782 49-8907', phones: '03782-498907' },
  { name: 'Parque Nacional Río Pilcomayo', url: 'nea/parque-nacional-rio-pilcomayo', ign: ['Sitio RAMSAR y Parque Nacional Río Pilcomayo'], town: 'Laguna Blanca, Formosa', address: 'Pueyrredón y Ruta Nacional 86, Laguna Blanca, Formosa', phone: '03718 47-0045', phones: '03718-470045' },
  { name: 'Reserva Natural Educativa Colonia Benítez', url: 'nea/reserva-natural-educativa-colonia-benitez', ign: ['Reserva Natural Educativa Colonia Benítez'], town: 'Colonia Benítez, Chaco', address: 'Av. Marcos Briolini s/n (predio del INTA), Colonia Benítez, Chaco' },
  { name: 'Reserva Natural Estricta San Antonio', url: 'nea/reserva-natural-estricta-san-antonio', ign: ['Reserva Natural Estricta San Antonio'], town: 'San Antonio, Misiones', address: 'San Martín s/n, San Antonio, Misiones', phone: '03741 49-3143', phones: '03741 493143' },
  { name: 'Reserva Natural Formosa', url: 'nea/reserva-natural-formosa', ign: ['Reserva Natural Formosa'], town: 'Ingeniero Juárez, Formosa', address: 'Ruta Nacional 81 entre Mosconi y Urquiza, Ingeniero Juárez, Formosa', phone: '011 3985-3800', phones: '011 3985-3800 int. 47001 / 47002 · WhatsApp +54 351 730-2154' },
  { name: 'Parque Interjurisdiccional Marino Isla Pingüino', url: 'patagonia-austral/parque-interjurisdiccional-marino-isla-pinguino', ign: ['Reserva Provincial y Parque Interjurisdiccional Marino Isla Pingüinos'], town: 'Puerto Deseado, Santa Cruz', address: 'San Martín 1137, Puerto Deseado, Santa Cruz', phone: '0297 487-0220', phones: '(0297) 487-0220' },
  { name: 'Parque Interjurisdiccional Marino Makenke', url: 'patagonia-austral/parque-interjurisdiccional-marino-makenke', ign: ['Parque Interjurisdiccional Marino Makenke'], town: 'Puerto San Julián, Santa Cruz', address: 'Av. Hernando de Magallanes 335, Puerto San Julián, Santa Cruz', phone: '02962 46-0952', phones: '02962 46-0952' },
  { name: 'Parque Nacional Bosques Petrificados de Jaramillo', url: 'patagonia-austral/parque-nacional-bosques-petrificados-de-jaramillo', ign: ['Parque Nacional Bosques Petrificados de Jaramillo'], town: 'Jaramillo, Santa Cruz', address: 'Teófilo Martínez s/n, Jaramillo, Santa Cruz', phone: '011 3985-3800', phones: '011 3985-3800 int. 30001 (intendencia)', emergency: [{ label: 'Centro operativo', phone: '297 423-4469' }] },
  { name: 'Parque Nacional Los Glaciares', url: 'patagonia-austral/parque-nacional-los-glaciares', ign: ['Parque Nacional Los Glaciares', 'Reserva Nacional Los Glaciares'], town: 'El Calafate, Santa Cruz', address: 'Av. Libertador 1302, El Calafate, Santa Cruz', phone: '02902 49-1005', phones: '02902-491005 / 02902-491788 / 02902-491545 · centro de informes 02902-492504' },
  { name: 'Parque Nacional Monte León', url: 'patagonia-austral/parque-nacional-monte-leon', ign: ['Parque Nacional Monte León', 'Reserva Nacional Monte León'], town: 'Puerto Santa Cruz, Santa Cruz', address: 'Juan Williams 361, Puerto Santa Cruz, Santa Cruz', phone: '02962 49-8184', phones: '02962-498184' },
  { name: 'Parque Nacional Patagonia', url: 'patagonia-austral/parque-nacional-patagonia', ign: ['Parque Nacional Patagonia'], town: 'Los Antiguos, Santa Cruz', address: 'Terminal de ómnibus, Av. Tehuelches 157, Los Antiguos, Santa Cruz', phone: '297 423-9441', phones: '2974239441' },
  { name: 'Parque Nacional Perito Moreno', url: 'patagonia-austral/parque-nacional-perito-moreno', ign: ['Parque Nacional Perito Moreno', 'Reserva Nacional Perito Moreno'], town: 'Gobernador Gregores, Santa Cruz', address: 'Paseo 9 de Julio 610, Gobernador Gregores, Santa Cruz', phone: '02962 40-9358', phones: '02962-409358' },
  { name: 'Parque Nacional Tierra del Fuego', url: 'patagonia-austral/parque-nacional-tierra-del-fuego', ign: ['Parque Nacional Tierra del Fuego'], town: 'Ushuaia, Tierra del Fuego', address: 'San Martín 1395, Ushuaia, Tierra del Fuego', phone: '02901 57-7931', phones: '02901-577931 / 02901-577993' },
  { name: 'Parque Nacional Islote Lobos', url: 'regionpatagonia/parque-nacional-islote-lobos', ign: ['Parque Nacional Islote Lobos'], town: 'Sierra Grande, Río Negro', address: '' },
  { name: 'Parque Nacional Lago Puelo', url: 'regionpatagonia/parque-nacional-lago-puelo', ign: ['Parque Nacional Lago Puelo', 'Reserva Nacional Lago Puelo'], town: 'Lago Puelo, Chubut', address: 'Lago Puelo, Chubut', phone: '02944 49-9232', phones: '02944-499232 / 02944-499064' },
  { name: 'Parque Nacional Laguna Blanca', url: 'regionpatagonia/parque-nacional-laguna-blanca', ign: ['Sitio RAMSAR, Parque y Reserva Nacional Laguna Blanca'], town: 'Zapala, Neuquén', address: 'Uriburu 61, Zapala, Neuquén', phone: '2942 66-5085', phones: 'WhatsApp 2942-665085 (9 a 19 h)' },
  {
    name: 'Parque Nacional Lanín', url: 'regionpatagonia/parque-nacional-lanin', ign: ['Parque Nacional Lanín', 'Reserva Nacional Lanín'], town: 'San Martín de los Andes, Neuquén', address: 'Perito Moreno 1006, San Martín de los Andes, Neuquén', phone: '02972 42-7233', phones: '02972-427233 / 02972-420664 int. 109',
    radio: [APN_EMERGENCY(LANIN_SIGNS)],
  },
  { name: 'Parque Nacional Lihué Calel', url: 'regionpatagonia/parque-nacional-lihue-calel', ign: ['Parque Nacional Lihué Calel'], town: 'General Acha, La Pampa', address: 'Balcarce 933, General Acha, La Pampa', phone: '02952 41-6213', phones: '02952-416213' },
  { name: 'Parque Nacional Los Alerces', url: 'regionpatagonia/parque-nacional-los-alerces', ign: ['Parque Nacional Los Alerces', 'Reserva Nacional Los Alerces'], town: 'Villa Futalaufquen, Chubut', address: 'Villa Futalaufquen, Chubut', phone: '+54 9 2945 54-8973', phones: '+54 9 2945 54-8973' },
  {
    name: 'Parque Nacional Nahuel Huapi', url: 'regionpatagonia/parque-nacional-nahuel-huapi', ign: ['Parque Nacional Nahuel Huapi', 'Reserva Nacional Nahuel Huapi'], town: 'San Carlos de Bariloche, Río Negro', address: 'Av. San Martín 24, San Carlos de Bariloche, Río Negro', phone: '0294 442-3111', phones: '0294-4423111 / 4423121 / 4422734 int. 200',
    emergency: [
      { label: 'Incendios, comunicaciones y emergencias (ICE)', phone: '105' },
      { label: 'Radioestación del parque', phone: '294 430-3219' },
    ],
    radio: [
      APN_EMERGENCY(`${VLA_MAP}; ${PAMPA_LINDA}`),
      { freq: '150,335 MHz', label: 'Incendios, comunicaciones y emergencias (ICE)', source: PAMPA_LINDA },
      { freq: '148,450 MHz', label: 'Club Andino Bariloche', source: PAMPA_LINDA },
    ],
  },
  {
    name: 'Parque Nacional Los Arrayanes', url: 'regionpatagonia/parque-nacional-los-arrayanes', ign: ['Parque Nacional Los Arrayanes'], town: 'San Carlos de Bariloche, Río Negro', address: 'Intendencia del PN Nahuel Huapi: San Martín 24, San Carlos de Bariloche, Río Negro', phone: '02944 42-3121', phones: '02944-423121 / 02944-423111 (intendencia del PN Nahuel Huapi)',
    emergency: [{ label: 'Incendios, comunicaciones y emergencias (ICE)', phone: '105' }],
    radio: [APN_EMERGENCY(VLA_MAP)],
  },
];

// ---------- Geometría ----------
const r4 = (n) => Math.round(n * 1e4) / 1e4;

/** Douglas-Peucker sobre un anillo [lon, lat] (tolerancia en grados). */
function simplify(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Área del anillo en grados² (para descartar islotes que no se ven). */
const ringArea = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);

const TOL = 0.0015; // ~150 m
const MIN_AREA = 1e-6; // ~1 ha

function polygons(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const poly of polys) {
    // Anillo cerrado (el primer punto se repite al final): se simplifica en dos mitades para que los extremos no coincidan.
    const simplifyRing = (ring) => {
      const mid = Math.floor(ring.length / 2);
      return [...simplify(ring.slice(0, mid + 1), TOL).slice(0, -1), ...simplify(ring.slice(mid), TOL)];
    };
    const rings = poly.map((ring) => simplifyRing(ring).map(([x, y]) => [r4(x), r4(y)])).filter((r) => r.length >= 4 && ringArea(r) > MIN_AREA);
    if (rings.length) out.push(rings);
  }
  return out;
}

// ---------- Generar ----------
const res = await fetch(IGN, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`IGN: ${res.status}`);
const features = (await res.json()).features;
const byName = new Map();
for (const f of features) {
  const name = (f.properties.fna ?? '').trim();
  byName.set(name, [...(byName.get(name) ?? []), f]);
  byName.set(name.replace(/\s+/g, ' '), byName.get(name));
}

const parks = [];
for (const p of PARKS) {
  const area = [];
  for (const n of p.ign) {
    const fs = byName.get(n) ?? byName.get(n.replace(/\s+/g, ' '));
    if (!fs) throw new Error(`Sin polígono del IGN: ${n}`);
    for (const f of fs) area.push(...polygons(f.geometry));
  }
  const q = new URLSearchParams({ q: `${p.town}, Argentina`, format: 'json', limit: '1' });
  const geo = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': UA } });
  const [hit] = geo.ok ? await geo.json() : [];
  if (!hit) throw new Error(`Nominatim no ubica: ${p.town}`);
  // Política de uso de Nominatim: como máximo un pedido por segundo.
  await new Promise((r) => setTimeout(r, 1100));
  parks.push({
    name: p.name,
    url: APN + p.url,
    address: p.address,
    phone: p.phone ?? '',
    phones: p.phones ?? '',
    ...(p.emergency && { emergency: p.emergency }),
    ...(p.radio && { radio: p.radio }),
    lat: r4(Number(hit.lat)),
    lon: r4(Number(hit.lon)),
    area,
  });
}

const data = {
  source: 'Límites: IGN, capa "Área protegida" (CC BY 4.0). Intendencias y teléfonos: Administración de Parques Nacionales, argentina.gob.ar/parquesnacionales (CC BY 4.0), noviembre de 2026. Frecuencias: las publicadas por cada parque, con su fuente.',
  parks,
};
await writeFile(OUT, JSON.stringify(data));
const points = parks.reduce((s, p) => s + p.area.flat().length, 0);
console.log(`${parks.length} áreas, ${points} puntos de límite → ${OUT} (${JSON.stringify(data).length} bytes)`);

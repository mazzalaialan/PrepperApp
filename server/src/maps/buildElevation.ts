/**
 * Arma elevation.pmtiles para el servidor: baja las teselas de elevación
 * Terrarium de Terrain Tiles (AWS Open Data, que permite descarga masiva)
 * de una zona y las guarda en un solo archivo.
 *
 *   node src/maps/buildElevation.ts --out /ruta/maps/elevation.pmtiles
 *   (opcional: --bounds oeste,sur,este,norte  --maxzoom 12  --parallel 8)
 *
 * Por defecto: Argentina, Chile, Uruguay, Bolivia y Perú hasta zoom 12 (~265.000 teselas).
 * Se puede cortar y volver a correr: lo bajado queda en `<out>.parts.sqlite`
 * y solo se pide lo que falta. Al terminar ese archivo se borra.
 */
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { zxyToTileId } from 'pmtiles';
import { PmtilesWriter } from './pmtiles.ts';

export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
/** Argentina, Chile (continental), Uruguay, Bolivia y Perú. */
export const DEFAULT_BOUNDS = { west: -81.5, south: -56, east: -53, north: 0 };

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Teselas de la zona, de zoom 0 a maxZoom, ordenadas por tileId (como las pide el PMTiles). */
export function tilesIn(bounds: typeof DEFAULT_BOUNDS, maxZoom: number): { id: number; z: number; x: number; y: number }[] {
  const out: { id: number; z: number; x: number; y: number }[] = [];
  for (let z = 0; z <= maxZoom; z++) {
    const max = 2 ** z - 1;
    for (let x = Math.max(0, lonToX(bounds.west, z)); x <= Math.min(max, lonToX(bounds.east, z)); x++)
      for (let y = Math.max(0, latToY(bounds.north, z)); y <= Math.min(max, latToY(bounds.south, z)); y++) out.push({ id: zxyToTileId(z, x, y), z, x, y });
  }
  return out.sort((a, b) => a.id - b.id);
}

async function fetchTile(url: string): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'VikArg-server (map package builder)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 5) throw new Error(`${url}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export async function buildElevation(opts: { out: string; bounds: typeof DEFAULT_BOUNDS; maxZoom: number; parallel: number; source?: string; log?: (s: string) => void }) {
  const log = opts.log ?? ((s: string) => console.log(s));
  const source = opts.source ?? TERRARIUM_URL;
  const tiles = tilesIn(opts.bounds, opts.maxZoom);
  const partsPath = `${opts.out}.parts.sqlite`;
  const parts = new DatabaseSync(partsPath);
  parts.exec('CREATE TABLE IF NOT EXISTS tiles (id INTEGER PRIMARY KEY, data BLOB NOT NULL)');
  const has = parts.prepare('SELECT 1 FROM tiles WHERE id = ?');
  const put = parts.prepare('INSERT OR REPLACE INTO tiles (id, data) VALUES (?, ?)');

  const missing = tiles.filter((t) => !has.get(t.id));
  log(`${tiles.length} teselas en la zona, faltan ${missing.length}.`);
  let next = 0;
  let done = 0;
  const started = Date.now();
  async function worker() {
    while (next < missing.length) {
      const t = missing[next++]!;
      const data = await fetchTile(source.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)));
      put.run(t.id, data);
      if (++done % 1000 === 0 || done === missing.length) {
        const perSec = done / ((Date.now() - started) / 1000);
        log(`  ${done}/${missing.length} (${Math.round(perSec)}/s, faltan ~${Math.round((missing.length - done) / perSec / 60)} min)`);
      }
    }
  }
  await Promise.all(Array.from({ length: opts.parallel }, worker));

  log('Armando el archivo…');
  const writer = await PmtilesWriter.create(opts.out);
  const rows = parts.prepare('SELECT id, data FROM tiles ORDER BY id');
  const wanted = new Set(tiles.map((t) => t.id));
  for (const row of rows.iterate() as Iterable<{ id: number; data: Uint8Array }>) if (wanted.has(row.id)) await writer.add(row.id, row.data);
  const result = await writer.finish(opts.out, {
    tileType: 'png',
    tileCompression: 'none',
    minZoom: 0,
    maxZoom: opts.maxZoom,
    bounds: opts.bounds,
    metadata: { name: 'VikArg elevation', encoding: 'terrarium', attribution: 'Terrain Tiles (AWS Open Data): Mapzen, USGS, NASA SRTM, y otros' },
  });
  parts.close();
  rmSync(partsPath, { force: true });
  log(`Listo: ${opts.out}: ${result.tiles} teselas (${result.contents} distintas), ${Math.round(result.bytes / 1024 / 1024)} MB.`);
  return result;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, bounds: { type: 'string' }, maxzoom: { type: 'string' }, parallel: { type: 'string' } } });
  if (!values.out) {
    console.error('Falta --out (ej.: --out ./maps/elevation.pmtiles)');
    process.exit(1);
  }
  const b = values.bounds?.split(',').map(Number);
  const bounds = b && b.length === 4 && b.every(Number.isFinite) ? { west: b[0]!, south: b[1]!, east: b[2]!, north: b[3]! } : DEFAULT_BOUNDS;
  await buildElevation({ out: values.out, bounds, maxZoom: Number(values.maxzoom ?? 12), parallel: Number(values.parallel ?? 8) });
}

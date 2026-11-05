import * as maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
// MapLibre 6 dibuja con un worker aparte: con Vite hay que indicarle dónde queda el archivo.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import './appSources';
import { decodeTerrarium, HATCH_RECENT, HATCH_USUAL, overzoomElevation, paintSlopeTile, slopeTile, type SlopeStyle } from './slope';
import { themeColors } from './style';
import { cachedOr, DEM_MAX_ZOOM, DEM_URL, fill, GLYPHS_URL, LOCAL_TILE, networkTile, networkUrl } from './tiles';

/**
 * Protocolos propios de MapLibre: cada pedido busca primero en lo descargado
 * y, si falta y hay conexión, en el servidor propio o las fuentes públicas
 * (sources.ts). Así una zona descargada sigue andando aunque OpenFreeMap
 * publique una versión nueva del mapa.
 */

let ready = false;
let contoursUrl = '';

/** Últimas teselas de altura ya decodificadas: con zoom alto, muchas teselas de pendiente salen de la misma. */
const decoded = new Map<string, Promise<Float32Array | null>>();
const DECODED_MAX = 24;

function demHeights(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  let hit = decoded.get(key);
  if (hit) {
    decoded.delete(key);
  } else {
    hit = cachedOr(fill(DEM_URL, z, x, y), networkTile('dem', z, x, y)).then((png) => (png ? decodeTerrarium(png) : null));
    // Una falla no se recuerda: puede volver la conexión.
    hit.then((h) => h ?? decoded.delete(key)).catch(() => decoded.delete(key));
  }
  decoded.set(key, hit);
  while (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value!);
  return hit;
}

const parseZxy = (url: string) => {
  const [z, x, y] = url.replace(/^\w+:\/\//, '').split('/').map(Number);
  return { z: z!, x: x!, y: y! };
};

export function setupProtocols(): { contoursUrl: string } {
  if (ready) return { contoursUrl };
  ready = true;
  maplibregl.setWorkerUrl(workerUrl);

  maplibregl.addProtocol('vktile', async (params) => {
    const { z, x, y } = parseZxy(params.url);
    const data = await cachedOr(fill(LOCAL_TILE, z, x, y), networkTile('vector', z, x, y));
    // Sin datos: tesela vacía (se ve el fondo y el contorno), no un error.
    return { data: data ?? new ArrayBuffer(0) };
  });

  maplibregl.addProtocol('vkdem', async (params) => {
    const { z, x, y } = parseZxy(params.url);
    const data = await cachedOr(fill(DEM_URL, z, x, y), networkTile('dem', z, x, y));
    if (!data) throw new Error('sin elevación');
    return { data };
  });

  // Riesgo de avalancha: la pendiente se calcula con la misma tesela de altura (anda sin conexión si la zona está bajada).
  maplibregl.addProtocol('vkslope', async (params) => {
    // "vkslope://z/x/y?min=1850&lee=90,135&usual=45": la línea de nieve y el sotavento (reciente y habitual) van en la dirección, así cambiarlos vuelve a pintar.
    const [path, query] = params.url.split('?');
    const { z, x, y } = parseZxy(path!);
    const q = new URLSearchParams(query ?? '');
    const minElevation = Number(q.get('min') ?? 0) || 0;
    const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
    const c = themeColors();
    const colors = { low: c.ok, caution: c.warn, avalanche: c.danger, steep: c.steep, hatch: HATCH_RECENT, hatchUsual: HATCH_USUAL };
    if (z > DEM_MAX_ZOOM) {
      // Más cerca que la elevación: la altura se interpola suave y la pendiente se calcula a la escala de la pantalla,
      // así los bordes entre colores no salen en escalones y las rayas mantienen su ancho.
      const elev = await overzoomElevation(z, x, y, DEM_MAX_ZOOM, (tx, ty) => demHeights(DEM_MAX_ZOOM, tx, ty), 1);
      if (!elev) throw new Error('sin elevación');
      const style: SlopeStyle = { colors, minElevation, lee: list('lee'), leeUsual: list('usual') };
      return { data: await paintSlopeTile(elev, z, x, y, style, 1) };
    }
    const dem = await cachedOr(fill(DEM_URL, z, x, y), networkTile('dem', z, x, y));
    if (!dem) throw new Error('sin elevación');
    return { data: await slopeTile(dem, z, x, y, colors, minElevation, list('lee'), list('usual')) };
  });

  maplibregl.addProtocol('vkglyph', async (params) => {
    const [fontstack, range] = params.url.replace('vkglyph://', '').split('/');
    const url = GLYPHS_URL.replace('{fontstack}', fontstack!).replace('{range}', range!);
    const data = await cachedOr(url, networkUrl(url));
    if (!data) throw new Error('sin letras');
    return { data };
  });

  // Curvas de nivel: maplibre-contour pide la elevación por su cuenta; se le cambia la forma de pedirla
  // para que use lo descargado y, si falta, la misma fuente que el resto del mapa (servidor propio o públicas).
  const dem = new mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: DEM_MAX_ZOOM, worker: false });
  const manager = (dem as unknown as { manager?: { getTile?: unknown } }).manager;
  if (manager && 'getTile' in manager) {
    manager.getTile = async (url: string) => {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
      const data = m ? await cachedOr(url, networkTile('dem', Number(m[1]), Number(m[2]), Number(m[3]))) : null;
      if (!data) throw new Error('sin elevación');
      return { data: new Blob([data], { type: 'image/png' }) };
    };
  }
  dem.setupMaplibre(maplibregl);
  contoursUrl = dem.contourProtocolUrl({
    // Equidistancia [fina, maestra] en metros, según el zoom.
    thresholds: { 9: [500, 1000], 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 14: [10, 50] },
    elevationKey: 'ele',
    levelKey: 'level',
    contourLayer: 'contours',
  });
  return { contoursUrl };
}

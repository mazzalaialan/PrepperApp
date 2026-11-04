import * as maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
// MapLibre 6 dibuja con un worker aparte: con Vite hay que indicarle dónde queda el archivo.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { slopeTile } from './slope';
import { themeColors } from './style';
import { cachedOrNetwork, DEM_MAX_ZOOM, DEM_URL, fill, GLYPHS_URL, LOCAL_TILE, vectorTemplate } from './tiles';

/**
 * Protocolos propios de MapLibre: cada pedido busca primero en lo descargado
 * y, si falta y hay conexión, en internet. Así una zona descargada sigue
 * andando aunque OpenFreeMap publique una versión nueva del mapa.
 */

let ready = false;
let contoursUrl = '';

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
    const data = await cachedOrNetwork(fill(LOCAL_TILE, z, x, y), async () => fill(await vectorTemplate(), z, x, y));
    // Sin datos: tesela vacía (se ve el fondo y el contorno), no un error.
    return { data: data ?? new ArrayBuffer(0) };
  });

  maplibregl.addProtocol('vkdem', async (params) => {
    const { z, x, y } = parseZxy(params.url);
    const url = fill(DEM_URL, z, x, y);
    const data = await cachedOrNetwork(url, async () => url);
    if (!data) throw new Error('sin elevación');
    return { data };
  });

  // Riesgo de avalancha: la pendiente se calcula con la misma tesela de altura (anda sin conexión si la zona está bajada).
  maplibregl.addProtocol('vkslope', async (params) => {
    // "vkslope://z/x/y?min=1850&lee=90,135": la línea de nieve y el sotavento van en la dirección, así cambiarlos vuelve a pintar.
    const [path, query] = params.url.split('?');
    const { z, x, y } = parseZxy(path!);
    const q = new URLSearchParams(query ?? '');
    const minElevation = Number(q.get('min') ?? 0) || 0;
    const lee = (q.get('lee') ?? '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
    const url = fill(DEM_URL, z, x, y);
    const dem = await cachedOrNetwork(url, async () => url);
    if (!dem) throw new Error('sin elevación');
    const c = themeColors();
    return { data: await slopeTile(dem, z, x, y, { low: c.ok, caution: c.warn, avalanche: c.danger, steep: c.steep, hatch: c.text }, minElevation, lee) };
  });

  maplibregl.addProtocol('vkglyph', async (params) => {
    const [fontstack, range] = params.url.replace('vkglyph://', '').split('/');
    const url = GLYPHS_URL.replace('{fontstack}', fontstack!).replace('{range}', range!);
    const data = await cachedOrNetwork(url, async () => url);
    if (!data) throw new Error('sin letras');
    return { data };
  });

  // Curvas de nivel: maplibre-contour baja la elevación con fetch (el service worker la sirve de lo descargado).
  const dem = new mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: DEM_MAX_ZOOM, worker: false });
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

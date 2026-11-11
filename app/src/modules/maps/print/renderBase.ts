import * as maplibregl from 'maplibre-gl';
import type { LatLon } from '@/core/geo/geo';
import { setupProtocols } from '../protocols';
import { printStyle } from './style';

export interface BaseMap {
  /** El mapa ya dibujado (copia en un lienzo normal: no depende del contexto WebGL). */
  canvas: HTMLCanvasElement;
  /** Posición en píxeles del lienzo de un punto del terreno. */
  project: (p: LatLon) => { x: number; y: number };
  /** Punto del terreno bajo un píxel del lienzo. */
  unproject: (x: number, y: number) => LatLon;
  dispose: () => void;
}

export interface BaseMapInput {
  center: LatLon;
  zoom: number;
  /** Tamaño en píxeles CSS; el lienzo resultante mide esto por `pixelRatio`. */
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  /** Tiempo máximo para que lleguen las teselas. */
  timeoutMs?: number;
}

/**
 * Dibuja el mapa de una zona en un lienzo grande, fuera de pantalla, con el estilo de papel. Usa las mismas fuentes que el mapa
 * de la app (lo descargado primero; sin conexión alcanza con las zonas bajadas).
 */
export async function renderBaseMap({ center, zoom, cssWidth, cssHeight, pixelRatio, timeoutMs = 90_000 }: BaseMapInput): Promise<BaseMap> {
  const { contoursUrl } = setupProtocols();
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:-30000px;top:0;width:${cssWidth}px;height:${cssHeight}px;pointer-events:none`;
  document.body.append(el);
  const map = new maplibregl.Map({
    container: el,
    style: printStyle(contoursUrl),
    center: [center.lon, center.lat],
    zoom,
    pixelRatio,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    maxCanvasSize: [8192, 8192],
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  const dispose = () => {
    map.remove();
    el.remove();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MAP_TIMEOUT')), timeoutMs);
      map.once('error', (ev) => {
        const e = ev as unknown as { sourceId?: string; error: Error };
        // Una tesela que falta no es un error del mapa: se ve vacía. Solo se corta si falla el estilo.
        if (!e.sourceId) {
          clearTimeout(timer);
          reject(e.error);
        }
      });
      map.once('idle', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  } catch (err) {
    dispose();
    throw err;
  }
  const src = map.getCanvas();
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.getContext('2d')!.drawImage(src, 0, 0);
  const kx = canvas.width / cssWidth;
  const ky = canvas.height / cssHeight;
  return {
    canvas,
    project: (p) => {
      const pt = map.project([p.lon, p.lat]);
      return { x: pt.x * kx, y: pt.y * ky };
    },
    unproject: (x, y) => {
      const ll = map.unproject([x / kx, y / ky]);
      return { lat: ll.lat, lon: ll.lng };
    },
    dispose,
  };
}

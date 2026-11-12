import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { buildStyle, type MapColors } from '../style';

/** Colores fijos para papel (no dependen del tema de la app): fondo claro, curvas de nivel pardas, agua azul. */
export const PRINT_COLORS: MapColors = {
  bg: '#ffffff',
  surface: '#fbf9f4',
  surface2: '#e6e0d2',
  border: '#b9b19f',
  text: '#2b2b2b',
  muted: '#6a645a',
  accent: '#6b2e0a',
  info: '#2f7fc1',
  ok: '#7fae6d',
  warn: '#a8541d',
  danger: '#b3261e',
  slopeAvalanche: '#b3261e',
  steep: '#d9801a',
  extreme: '#8a1c1c',
  country: '#555555',
  province: '#8a8a8a',
};

type Paint = Record<string, unknown>;

/** Distancia entre rótulos de altura sobre una misma curva principal (px del mapa a 96 por pulgada: ~26 mm en el papel; por defecto serían ~66 mm). */
export const CONTOUR_LABEL_SPACING = 100;

/** Estilo del mapa impreso: el de la app con los colores de papel, relieve suave y curvas de nivel marcadas (la cada cinco, más gruesa). */
export function printStyle(contoursUrl: string): StyleSpecification {
  const style = buildStyle(PRINT_COLORS, contoursUrl, { hillshade: true, contours: true, slope: false, terrain3d: false });
  const tweak = (id: string, paint: Paint, layout?: Paint) => {
    const layer = style.layers.find((l) => l.id === id) as (LayerSpecification & { paint?: Paint; layout?: Paint }) | undefined;
    if (!layer) return;
    layer.paint = { ...(layer.paint ?? {}), ...paint };
    if (layout) layer.layout = { ...(layer.layout ?? {}), ...layout };
  };
  tweak('hillshade', { 'hillshade-shadow-color': '#7d7466', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#b9ad94', 'hillshade-exaggeration': 0.32 });
  tweak('contour-lines', { 'line-color': '#a8541d', 'line-opacity': ['match', ['get', 'level'], 1, 0.95, 0.6], 'line-width': ['match', ['get', 'level'], 1, 1.3, 0.55] });
  tweak('contour-labels', { 'text-color': '#8a4313', 'text-halo-color': '#fbf9f4', 'text-halo-width': 1.6 }, {
    'text-size': 11,
    'symbol-spacing': CONTOUR_LABEL_SPACING,
    // Que ninguna curva principal quede sin su altura: en terreno de montaña las curvas giran mucho (por defecto el rótulo se descarta
    // si la línea se dobla más de 45° bajo las letras) y no se descartan los que chocan con otros textos.
    'text-max-angle': 90,
    'text-allow-overlap': true,
    'text-padding': 1,
  });
  return style;
}

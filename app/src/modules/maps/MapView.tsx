import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { angleDiff } from '@/core/sensors/heading';
import { useEffectiveTheme } from '@/core/settings/theme';
import { setupProtocols } from './protocols';
import { buildStyle, MAX_PITCH_3D, PITCH_3D, TERRAIN, themeColors, type MapColors, type MapLayersOn } from './style';

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface MapCircle {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface ViewState {
  lat: number;
  lon: number;
  zoom: number;
}

interface Props {
  initial: ViewState;
  layers: MapLayersOn;
  showMine: boolean;
  waypoints: MapPoint[];
  routes: { id: string; name: string; points: [number, number][] }[];
  /** Tracks importados (GPX): recorrido y sus puntos, aparte de lo propio. */
  tracks: MapTrack[];
  showTracks: boolean;
  here: { lat: number; lon: number; accuracy: number } | null;
  zones: MapCircle[];
  preview: MapCircle | null;
  /** Contorno de la región (sin conexión y fuera de las zonas, al menos se ve dónde estás). */
  outline: FeatureCollection | null;
  /** Cambia `key` para mover la vista. */
  flyTo: (ViewState & { key: number }) | null;
  /** Vista que sigue tu posición (y gira con el rumbo, si hay) o libre. */
  follow?: boolean;
  /** Rumbo verdadero hacia donde mirás, para girar el mapa al seguirte. */
  heading?: number | null;
  /** Moviste el mapa con la mano: se deja de seguir. */
  onFollowBreak?: () => void;
  /** Parte ya recorrida del track que se está siguiendo, en [lon, lat]. */
  done?: [number, number][] | null;
  onMove: (view: ViewState) => void;
  onWaypoint: (id: string) => void;
}

export interface MapTrack {
  id: string;
  name: string;
  /** Segmentos en [lon, lat]. */
  lines: [number, number][][];
  points: { name: string; lon: number; lat: number }[];
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Círculo geodésico aproximado (64 lados) para dibujar una zona. */
export function circlePolygon(lat: number, lon: number, radiusKm: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    out.push([lon + (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a), lat + (radiusKm / 111.32) * Math.cos(a)]);
  }
  return out;
}

const circlesGeo = (circles: MapCircle[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: circles.map((c) => ({ type: 'Feature', properties: { id: c.id, name: c.name }, geometry: { type: 'Polygon', coordinates: [circlePolygon(c.lat, c.lon, c.radiusKm)] } })),
});

function data(p: Props) {
  return {
    'mine-waypoints': {
      type: 'FeatureCollection',
      features: p.waypoints.map((w) => ({ type: 'Feature', properties: { id: w.id, name: w.name }, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } })),
    } as FeatureCollection,
    'mine-routes': {
      type: 'FeatureCollection',
      features: p.routes.filter((r) => r.points.length > 1).map((r) => ({ type: 'Feature', properties: { id: r.id, name: r.name }, geometry: { type: 'LineString', coordinates: r.points } })),
    } as FeatureCollection,
    'track-lines': {
      type: 'FeatureCollection',
      features: p.tracks.map((t) => ({ type: 'Feature', properties: { id: t.id, name: t.name }, geometry: { type: 'MultiLineString', coordinates: t.lines } })),
    } as FeatureCollection,
    'track-points': {
      type: 'FeatureCollection',
      features: p.tracks.flatMap((t) => t.points.map((w) => ({ type: 'Feature', properties: { track: t.id, name: w.name }, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } }))),
    } as FeatureCollection,
    'track-done': (p.done && p.done.length > 1
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.done } }] }
      : EMPTY) as FeatureCollection,
    here: (p.here
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { accuracy: p.here.accuracy }, geometry: { type: 'Point', coordinates: [p.here.lon, p.here.lat] } }] }
      : EMPTY) as FeatureCollection,
    zones: circlesGeo(p.zones),
    preview: circlesGeo(p.preview ? [p.preview] : []),
    outline: p.outline ?? EMPTY,
  };
}

/** Capas propias encima del estilo base; se vuelven a agregar cada vez que cambia el estilo (tema). */
function addOverlays(map: MlMap, c: MapColors, p: Props) {
  const d = data(p);
  for (const [id, fc] of Object.entries(d)) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: fc });
  const mine = p.showMine ? 'visible' : 'none';
  // El contorno va debajo de todo lo dibujado del mapa, pero arriba del fondo.
  map.addLayer({ id: 'outline', type: 'line', source: 'outline', paint: { 'line-color': c.muted, 'line-width': 0.8 } }, 'landcover-wood');
  map.addLayer({ id: 'zones', type: 'line', source: 'zones', paint: { 'line-color': c.info, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  map.addLayer({ id: 'preview-fill', type: 'fill', source: 'preview', paint: { 'fill-color': c.accent, 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'preview-line', type: 'line', source: 'preview', paint: { 'line-color': c.accent, 'line-width': 2 } });
  // Tracks importados: en otro color, para no confundirlos con las rutas propias.
  const tracks = p.showTracks ? 'visible' : 'none';
  map.addLayer({ id: 'track-lines', type: 'line', source: 'track-lines', layout: { visibility: tracks, 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.info, 'line-width': 3.5, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'track-done', type: 'line', source: 'track-done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.accent, 'line-width': 5 } });
  map.addLayer({ id: 'track-points', type: 'circle', source: 'track-points', layout: { visibility: tracks }, paint: { 'circle-radius': 4.5, 'circle-color': c.info, 'circle-stroke-color': c.bg, 'circle-stroke-width': 1.5 } });
  map.addLayer({
    id: 'track-point-names',
    type: 'symbol',
    source: 'track-points',
    minzoom: 12,
    layout: { visibility: tracks, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top' },
    paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2 },
  });
  map.addLayer({ id: 'mine-routes', type: 'line', source: 'mine-routes', layout: { visibility: mine, 'line-cap': 'round' }, paint: { 'line-color': c.accent, 'line-width': 3, 'line-opacity': 0.85 } });
  map.addLayer({
    id: 'mine-waypoints',
    type: 'circle',
    source: 'mine-waypoints',
    layout: { visibility: mine },
    paint: { 'circle-radius': 6, 'circle-color': c.accent, 'circle-stroke-color': c.bg, 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'mine-waypoint-names',
    type: 'symbol',
    source: 'mine-waypoints',
    layout: { visibility: mine, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
    paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2 },
  });
  map.addLayer({ id: 'here', type: 'circle', source: 'here', paint: { 'circle-radius': 7, 'circle-color': c.info, 'circle-stroke-color': c.text, 'circle-stroke-width': 2 } });
}

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const theme = useEffectiveTheme();
  const styleReady = useRef(false);
  /** Inclinación a la que se está yendo al pasar a 3D o a plano (el seguimiento la respeta). */
  const pendingPitch = useRef<number | null>(null);

  /** Relieve, inclinación permitida y la inclinación actual según 3D o plano. */
  function syncTerrain(m: MlMap) {
    const on = latest.current.layers.terrain3d;
    m.setTerrain(on ? TERRAIN : null);
    if (on) m.setMaxPitch(MAX_PITCH_3D);
    const target = on ? (m.getPitch() > 0 ? m.getPitch() : PITCH_3D) : 0;
    if (m.getPitch() === target) {
      if (!on) m.setMaxPitch(0);
      container.current?.setAttribute('data-terrain', on ? 'on' : 'off');
      return;
    }
    pendingPitch.current = target;
    m.easeTo({ pitch: target, duration: 500 });
    m.once('moveend', () => {
      pendingPitch.current = null;
      if (!latest.current.layers.terrain3d) m.setMaxPitch(0);
    });
  }

  useEffect(() => {
    const { contoursUrl } = setupProtocols();
    const m = new maplibregl.Map({
      container: container.current!,
      style: buildStyle(themeColors(), contoursUrl, props.layers),
      center: [props.initial.lon, props.initial.lat],
      zoom: props.initial.zoom,
      attributionControl: { compact: true },
      maxZoom: 17,
      pitch: props.layers.terrain3d ? PITCH_3D : 0,
      maxPitch: props.layers.terrain3d ? MAX_PITCH_3D : 0,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    m.on('style.load', () => {
      addOverlays(m, themeColors(), latest.current);
      styleReady.current = true;
      syncTerrain(m);
    });
    // Los créditos arrancan plegados (botón "i"): abiertos tapan la escala y el botón de ubicación en el celular.
    m.once('load', () => container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    m.on('moveend', () => {
      // Inclinación y relieve a la vista (para las pruebas y para depurar en el celular).
      container.current?.setAttribute('data-pitch', String(Math.round(m.getPitch())));
      container.current?.setAttribute('data-terrain', m.getTerrain() ? 'on' : 'off');
      const c = m.getCenter();
      latest.current.onMove({ lat: c.lat, lon: c.lng, zoom: m.getZoom() });
    });
    m.on('click', 'mine-waypoints', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) latest.current.onWaypoint(id);
    });
    // Arrastrar o girar con la mano corta el seguimiento (acercar o inclinar, no).
    const breakFollow = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && latest.current.follow) latest.current.onFollowBreak?.();
    };
    m.on('dragstart', breakFollow);
    m.on('rotatestart', breakFollow);
    m.on('mouseenter', 'mine-waypoints', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'mine-waypoints', () => (m.getCanvas().style.cursor = ''));
    return () => {
      m.remove();
      map.current = null;
    };
    // El mapa se crea una vez; lo demás se actualiza abajo.
  }, []);

  // Cambio de tema: estilo nuevo con los colores nuevos (se leen después de que el tema se aplicó).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const frame = requestAnimationFrame(() => {
      styleReady.current = false;
      m.setStyle(buildStyle(themeColors(), setupProtocols().contoursUrl, latest.current.layers));
    });
    return () => cancelAnimationFrame(frame);
  }, [theme]);

  useEffect(() => {
    const m = map.current;
    // `isStyleLoaded()` da falso mientras bajan teselas: se usa la carga del estilo en sí.
    if (!m || !styleReady.current) return;
    for (const id of ['hillshade']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.layers.hillshade ? 'visible' : 'none');
    for (const id of ['contour-lines', 'contour-labels']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.layers.contours ? 'visible' : 'none');
    for (const id of ['mine-routes', 'mine-waypoints', 'mine-waypoint-names']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.showMine ? 'visible' : 'none');
    for (const id of ['track-lines', 'track-points', 'track-point-names']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.showTracks ? 'visible' : 'none');
  }, [props.layers.hillshade, props.layers.contours, props.showMine, props.showTracks]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [id, fc] of Object.entries(data(props))) (m.getSource(id) as GeoJSONSource | undefined)?.setData(fc);
  }, [props.waypoints, props.routes, props.tracks, props.done, props.here, props.zones, props.preview, props.outline]);

  useEffect(() => {
    if (props.flyTo) map.current?.flyTo({ center: [props.flyTo.lon, props.flyTo.lat], zoom: props.flyTo.zoom, essential: true });
  }, [props.flyTo?.key]);

  // 3D o plano. Si el estilo todavía carga, se aplica al terminar (en `style.load`).
  useEffect(() => {
    const m = map.current;
    if (m && styleReady.current) syncTerrain(m);
  }, [props.layers.terrain3d]);

  // Seguimiento: el mapa va con tu posición y, si hay brújula, gira para que adelante quede arriba.
  const followed = useRef<{ lat: number; lon: number; bearing: number | null } | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!props.follow) followed.current = null;
    if (!m || !props.follow || !props.here) return;
    const last = followed.current;
    let bearing = last?.bearing ?? null;
    // Pequeños temblores de la brújula no giran el mapa.
    if (props.heading != null && (bearing === null || Math.abs(angleDiff(bearing, props.heading)) > 4)) bearing = props.heading;
    if (last && last.lat === props.here.lat && last.lon === props.here.lon && last.bearing === bearing) return;
    followed.current = { lat: props.here.lat, lon: props.here.lon, bearing };
    m.easeTo({
      center: [props.here.lon, props.here.lat],
      bearing: bearing ?? m.getBearing(),
      zoom: last ? m.getZoom() : Math.max(m.getZoom(), 15),
      // Si se estaba pasando a 3D o a plano, este movimiento termina esa inclinación.
      ...(pendingPitch.current !== null ? { pitch: pendingPitch.current } : {}),
      duration: 500,
      essential: true,
    });
  }, [props.follow, props.here, props.heading]);

  return <div ref={container} className="maps-canvas" data-testid="offline-map" />;
}

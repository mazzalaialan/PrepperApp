import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Navigation, X } from 'lucide-react';
import type { ContactKind } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { MapView, type MapPoint, type ViewState } from '@/modules/maps/MapView';
import { outlineFeatures } from '@/modules/maps/outline';
import { loadGeoData } from '@/modules/weathermap/geo';
import { FullscreenStage } from '@/ui/FullscreenStage';
import type { NearbyPlace } from './data';
import { formatDistance, KindIcon, PhoneActions } from './parts';
import { SERVICE_KINDS } from './services';

const NONE: never[] = [];

/** Mismos colores que los íconos de la lista (app.css, .contact-icon-*). */
const TONE: Partial<Record<ContactKind, MapPoint['tone']>> = {
  police: 'info',
  fire: 'danger',
  medical: 'ok',
  hospital: 'ok',
  civilDefense: 'warn',
  pharmacy: 'ok',
  aed: 'danger',
  water: 'info',
  shelter: 'warn',
};

/**
 * Los resultados de "Buscar cercanos" en el mapa: un punto con el nombre por
 * cada lugar y el punto de búsqueda. Sirve para ver cuáles se pueden alcanzar
 * de verdad (del mismo lado del río, sobre la ruta…), cosa que la distancia en
 * línea recta no dice. Al tocar un punto se ve su ficha, con el teléfono y
 * "cómo llegar". Usa los mapas sin conexión descargados; sin ellos, al menos el
 * contorno. Va en su propio archivo: MapLibre se carga recién al abrirlo.
 */
export function NearbyMap({ places, here }: { places: NearbyPlace[]; here: { lat: number; lon: number } }) {
  const { t, i18n } = useTranslation();
  const layers = useSettings((s) => s.settings.mapLayers);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<NearbyPlace | null>(null);
  useEffect(() => {
    void loadGeoData().then((geo) => setOutline(outlineFeatures(geo)));
  }, []);

  const points = useMemo<MapPoint[]>(
    () => places.map((p) => ({ id: p.key, name: p.name || t(`emergency.kind.${p.kind}`), lat: p.lat, lon: p.lon, ...(TONE[p.kind] && { tone: TONE[p.kind] }) })),
    [places, t],
  );
  // Encuadre que muestra el punto de búsqueda y todos los resultados. El mapa se arma una sola vez.
  const [start] = useState<{ view: ViewState; bounds?: [number, number, number, number] }>(() => {
    const lats = [here.lat, ...places.map((p) => p.lat)];
    const lons = [here.lon, ...places.map((p) => p.lon)];
    return {
      view: { lat: here.lat, lon: here.lon, zoom: 13 },
      ...(places.length > 0 && { bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] as [number, number, number, number] }),
    };
  });
  const [here0] = useState({ ...here, accuracy: 0 });

  const goTo = (p: NearbyPlace) =>
    `/orientation/go?lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}&name=${encodeURIComponent((p.name || t(`emergency.kind.${p.kind}`)).slice(0, 80))}&view=map`;

  return (
    <FullscreenStage className="maps-stage nearby-map" data-testid="nearby-map">
      <MapView
        initial={start.view}
        initialBounds={start.bounds}
        layers={layers}
        showMine
        waypoints={points}
        routes={NONE}
        tracks={NONE}
        showTracks={false}
        here={here0}
        zones={NONE}
        preview={null}
        outline={outline}
        flyTo={null}
        onMove={() => undefined}
        onWaypoint={(id) => setSelected(places.find((p) => p.key === id) ?? null)}
      />
      {selected && (
        <div className="card nearby-map-card" data-testid="nearby-map-card">
          <KindIcon kind={selected.kind} />
          <span className="list-main">
            <span className="list-title">{selected.name || t(`emergency.kind.${selected.kind}`)}</span>
            <span className="list-sub">
              {formatDistance(selected.distance, i18n.language)} · {selected.detail && (selected.source === 'official' || SERVICE_KINDS.has(selected.kind)) ? selected.detail : t(`emergency.kind.${selected.kind}`)}
            </span>
            {selected.address && <span className="list-sub">{selected.address}</span>}
            {selected.note && <span className="list-sub">{selected.note}</span>}
            <Link className="map-link" to={goTo(selected)}>
              <Navigation size={14} aria-hidden /> {t('emergency.howToGetThere')}
            </Link>
          </span>
          <span className="contact-actions">
            <PhoneActions phone={selected.phone} />
            <button className="icon-btn" type="button" onClick={() => setSelected(null)} aria-label={t('common.close')} title={t('common.close')}>
              <X size={18} />
            </button>
          </span>
        </div>
      )}
    </FullscreenStage>
  );
}

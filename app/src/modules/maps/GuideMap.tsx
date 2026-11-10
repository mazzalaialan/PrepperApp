import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { useTranslation } from 'react-i18next';
import { Navigation } from 'lucide-react';
import type { GeoFix } from '@/core/geo/useGeolocation';
import type { Waypoint } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { loadGeoData } from '@/modules/weathermap/geo';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { MapView, type ViewState } from './MapView';
import { outlineFeatures } from './outline';

const NONE: never[] = [];

/**
 * Mapa para guiarse hasta un punto: te sigue (girando con la brújula, si hay),
 * marca el punto y dibuja la línea recta desde donde estás. Usa los mapas sin
 * conexión descargados; sin ellos, al menos el contorno. Va en su propio
 * archivo: MapLibre se carga recién al elegir esta vista.
 */
export function GuideMap({ target, fix, heading, overlay }: { target: Waypoint; fix: GeoFix; heading: number | null; overlay: React.ReactNode }) {
  const { t } = useTranslation();
  const layers = useSettings((s) => s.settings.mapLayers);
  const [follow, setFollow] = useState(true);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  const [start] = useState<ViewState>({ lat: fix.lat, lon: fix.lon, zoom: 15 });
  useEffect(() => {
    void loadGeoData().then((geo) => setOutline(outlineFeatures(geo)));
  }, []);
  const [markers] = useState([{ id: target.id, name: target.name, lat: target.lat, lon: target.lon }]);
  return (
    <FullscreenStage className="maps-stage" overlay={overlay} data-testid="guide-map">
      <MapView
        initial={start}
        layers={layers}
        showMine
        waypoints={markers}
        routes={NONE}
        tracks={NONE}
        showTracks={false}
        here={{ lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy }}
        zones={NONE}
        preview={null}
        outline={outline}
        flyTo={null}
        follow={follow}
        heading={heading}
        onFollowBreak={() => setFollow(false)}
        target={{ from: [fix.lon, fix.lat], to: [target.lon, target.lat] }}
        onMove={() => undefined}
        onWaypoint={() => undefined}
      />
      {!follow && (
        <button className="icon-btn maps-locate" type="button" onClick={() => setFollow(true)} aria-label={t('maps.camera.follow')} title={t('maps.camera.follow')}>
          <Navigation size={20} />
        </button>
      )}
    </FullscreenStage>
  );
}

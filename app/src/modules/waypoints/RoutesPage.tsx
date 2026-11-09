import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Route as RouteIcon, Upload } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { RouteFileError, routeFromFile } from './importRoute';
import { lineLength } from './plan';
import { routeLength, routePoints, useWaypoints } from './store';

/** Rutas armadas uniendo waypoints: van abajo de los waypoints, en la misma pantalla. */
export function RoutesSection() {
  const { t, i18n } = useTranslation();
  const routes = useWaypoints((s) => s.routes);
  const waypoints = useWaypoints((s) => s.waypoints);
  const units = useSettings((s) => s.settings.units);
  const navigate = useNavigate();
  const saveRoute = useWaypoints((s) => s.saveRoute);
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  /** Importa una ruta de un KML, KMZ, GPX o TCX como ruta planificada; los puntos con nombre del archivo solo se agregan como lugares si la persona lo pide. */
  async function importFile(f: File) {
    setImportError(null);
    try {
      const { route, places } = routeFromFile(new Uint8Array(await f.arrayBuffer()), f.name);
      await saveRoute(route);
      if (places.length > 0 && window.confirm(t('routes.import.askPlaces', { count: places.length }))) {
        for (const p of places) await saveWaypoint(newEntity<Waypoint>({ name: p.name, lat: p.lat, lon: p.lon, alt: p.ele, icon: 'pin', notes: p.desc, rainAlerts: false }));
      }
      navigate(`/orientation/routes/${route.id}`);
    } catch (err) {
      if (!(err instanceof RouteFileError)) throw err;
      setImportError(t(`routes.import.error.${err.code}`));
    }
  }
  const rows = useMemo(
    () =>
      [...routes.values()]
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
        .map((route) => ({ route, points: routePoints(route, waypoints) })),
    [routes, waypoints, i18n.language],
  );

  return (
    <section className="stack routes-section" aria-labelledby="routes-title">
      <div className="page-head">
        <h2 id="routes-title" className="section-title" style={{ flex: 1, margin: 0 }}>
          {t('modules.routes.title')}
        </h2>
        <button className="btn" type="button" data-testid="route-import" onClick={() => fileInput.current?.click()}>
          <Upload size={20} /> {t('routes.import.button')}
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          data-testid="route-import-file"
          accept=".kml,.kmz,.gpx,.tcx,.gz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml,application/xml,text/xml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        <Link className="btn" to="/orientation/routes/new">
          <Plus size={20} /> {t('routes.new')}
        </Link>
      </div>
      {importError && <p className="error" role="alert">{importError}</p>}
      {rows.length === 0 ? (
        <p className="empty">{waypoints.size < 2 ? t('routes.needPoints') : t('routes.empty')}</p>
      ) : (
        <ul className="list" data-testid="routes-list">
          {rows.map(({ route, points }) => (
            <li key={route.id}>
              <Link className="list-row" to={`/orientation/routes/${route.id}`}>
                <RouteIcon size={22} aria-hidden style={{ color: 'var(--accent)', flex: 'none' }} />
                <span className="list-main">
                  <span className="list-title">{route.name}</span>
                  <span className="list-sub">
                    {t('routes.pointCount', { count: route.line ? route.line.length : points.length })}
                    {route.line
                      ? ` · ${formatDistance(lineLength(route.line), units, i18n.language)} · ${t('routes.planned')}`
                      : points.length > 1 && ` · ${formatDistance(routeLength(points), units, i18n.language)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

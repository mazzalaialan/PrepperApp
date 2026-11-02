import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Locate, MapPin, Trash2, X } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { formatDms } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useHeading } from '@/core/sensors/useHeading';
import { useSettings, type MapLayers } from '@/core/settings/settings';
import { useTracks } from '@/modules/tracks/store';
import { routePoints, useWaypoints } from '@/modules/waypoints/store';
import { loadGeoData } from '@/modules/weathermap/geo';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { CameraButtons } from './CameraButtons';
import { MapView, type MapTrack, type ViewState } from './MapView';
import { useMapZones, type MapZone } from './store';
import { DETAILS, downloadZone, planZone, type DetailId, type DownloadProgress } from './tiles';

const RADII = [2, 5, 10, 20, 50];
const LAYER_KEYS: (keyof MapLayers)[] = ['hillshade', 'contours', 'mine', 'tracks'];
/** Vista que muestra un track entero (centro y zoom según lo que ocupa). */
function trackView(tr: { segments: [number, number, number | null][][] }): ViewState | null {
  const pts = tr.segments.flat();
  if (pts.length === 0) return null;
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * Math.cos((lats[0]! * Math.PI) / 180), 0.002);
  const zoom = Math.min(16, Math.max(7, Math.log2(360 / span) - 1.2));
  return { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lon: (Math.max(...lons) + Math.min(...lons)) / 2, zoom };
}

/** Centro de la Argentina, mientras no haya GPS ni zonas. */
const DEFAULT_VIEW: ViewState = { lat: -38.4, lon: -63.6, zoom: 3.6 };
/** Última vista, para volver al mismo lugar al reabrir la pantalla. */
let lastView: ViewState | null = null;

export function MapsPage() {
  const { t, i18n } = useTranslation();
  const layers = useSettings((s) => s.settings.mapLayers);
  const update = useSettings((s) => s.update);
  const waypointMap = useWaypoints((s) => s.waypoints);
  const routeMap = useWaypoints((s) => s.routes);
  const trackMap = useTracks((s) => s.tracks);
  // Desde un track ("Ver en el mapa"): el mapa arranca mostrándolo entero.
  const [params] = useSearchParams();
  const focusTrack = params.get('track') ? trackMap.get(params.get('track')!) : undefined;
  const { zones, missing, add, remove, loaded, load } = useMapZones();
  // El módulo se carga recién al abrir la pantalla (después de desbloquear): las zonas se leen acá.
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const { fix } = useGeolocation();
  // Vista que te sigue (y gira con la brújula) o libre; la brújula solo se escucha al seguirte.
  const [follow, setFollow] = useState(false);
  const caps = useCapabilities((s) => s.caps);
  const heading = useHeading(fix, follow && (caps?.orientation ?? false));
  const [online, setOnline] = useState(navigator.onLine);
  const [initial] = useState<ViewState>(() => (focusTrack ? trackView(focusTrack) : null) ?? lastView ?? (zones[0] ? { lat: zones[0].lat, lon: zones[0].lon, zoom: 11 } : DEFAULT_VIEW));
  const [view, setView] = useState<ViewState>(initial);
  const [flyTo, setFlyTo] = useState<(ViewState & { key: number }) | null>(null);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ name: string; radiusKm: number; detail: DetailId } | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [abort, setAbort] = useState<AbortController | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    const onLine = () => setOnline(navigator.onLine);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', onLine);
    // Contorno de Argentina, Chile y Uruguay (el del mapa de tiempo), como referencia sin teselas.
    void loadGeoData().then((geo) =>
      setOutline({
        type: 'FeatureCollection',
        features: geo.regions.map((r) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiLineString', coordinates: r.rings.map((ring) => Array.from({ length: ring.length / 2 }, (_, i) => [ring[i * 2]!, ring[i * 2 + 1]!])) },
        })),
      }),
    );
    return () => {
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', onLine);
    };
  }, []);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null));
  }, [zones]);

  // La primera vez que llega el GPS (y sin vista previa), el mapa va a tu ubicación.
  const [centered, setCentered] = useState(lastView !== null || !!focusTrack);
  useEffect(() => {
    if (fix && !centered) {
      setCentered(true);
      setFlyTo({ lat: fix.lat, lon: fix.lon, zoom: 12, key: Date.now() });
    }
  }, [fix, centered]);

  const waypoints = useMemo(() => [...waypointMap.values()].map((w) => ({ id: w.id, name: w.name, lat: w.lat, lon: w.lon })), [waypointMap]);
  const routes = useMemo(
    () => [...routeMap.values()].map((r) => ({ id: r.id, name: r.name, points: routePoints(r, waypointMap).map((w) => [w.lon, w.lat] as [number, number]) })),
    [routeMap, waypointMap],
  );
  const tracks = useMemo<MapTrack[]>(
    () =>
      [...trackMap.values()].map((tr) => ({
        id: tr.id,
        name: tr.name,
        lines: tr.segments.map((seg) => seg.map(([lat, lon]) => [lon, lat] as [number, number])),
        points: tr.waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon })),
      })),
    [trackMap],
  );
  const here = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy } : null), [fix]);
  const zoneCircles = useMemo(() => zones.map((z) => ({ id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusKm: z.radiusKm })), [zones]);
  const maxZoom = panel ? DETAILS.find((d) => d.id === panel.detail)!.maxZoom : 0;
  const plan = useMemo(() => (panel ? planZone(view.lat, view.lon, panel.radiusKm, maxZoom) : null), [panel, view.lat, view.lon, maxZoom]);
  const preview = useMemo(() => (panel ? { id: 'preview', name: panel.name, lat: view.lat, lon: view.lon, radiusKm: panel.radiusKm } : null), [panel, view.lat, view.lon]);

  const mb = (bytes: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: bytes < 10 * 1024 * 1024 ? 1 : 0 }).format(bytes / 1024 / 1024);
  const setLayer = (key: keyof MapLayers, on: boolean) => void update({ mapLayers: { ...layers, [key]: on } });

  function openPanel() {
    setMessage(null);
    setPanel({ name: t('maps.defaultName', { n: zones.length + 1 }), radiusKm: 10, detail: 'trails' });
    if (view.zoom < 9) setFlyTo({ ...view, zoom: 10, key: Date.now() });
  }

  async function startDownload() {
    if (!panel || !plan) return;
    const controller = new AbortController();
    setAbort(controller);
    setProgress({ done: 0, total: 1, bytes: 0, failed: 0 });
    setMessage(null);
    // Que el navegador no borre los mapas si se queda sin espacio.
    void navigator.storage?.persist?.();
    try {
      const result = await downloadZone(plan, setProgress, controller.signal);
      const zone: MapZone = {
        id: crypto.randomUUID(),
        name: panel.name.trim() || t('maps.defaultName', { n: zones.length + 1 }),
        lat: view.lat,
        lon: view.lon,
        radiusKm: panel.radiusKm,
        maxZoom,
        bytes: result.bytes,
        failed: result.failed,
        createdAt: new Date().toISOString(),
      };
      await add(zone);
      setPanel(null);
      setMessage(result.failed ? t('maps.doneWithErrors', { name: zone.name, count: result.failed }) : t('maps.done', { name: zone.name, mb: mb(result.bytes) }));
    } catch {
      setMessage(controller.signal.aborted ? t('maps.cancelled') : t('maps.failed'));
    } finally {
      setProgress(null);
      setAbort(null);
    }
  }

  async function handleRemove(zone: MapZone) {
    if (!window.confirm(t('maps.confirmDelete', { name: zone.name }))) return;
    await remove(zone.id);
  }

  const selectedWp = selected ? waypointMap.get(selected) : undefined;

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/orientation" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.maps.title')}</h1>
      </div>
      {!online && <p className="hint" role="status">{t('maps.offline')}</p>}

      <FullscreenStage className="maps-stage">
        <MapView
          initial={initial}
          layers={layers}
          showMine={layers.mine}
          waypoints={waypoints}
          routes={routes}
          tracks={tracks}
          showTracks={layers.tracks}
          here={here}
          zones={zoneCircles}
          preview={preview}
          outline={outline}
          flyTo={flyTo}
          follow={follow && !!fix}
          heading={heading?.trueHeading ?? null}
          onFollowBreak={() => setFollow(false)}
          onMove={(v) => {
            lastView = v;
            setView(v);
          }}
          onWaypoint={setSelected}
        />
        <CameraButtons threeD={layers.terrain3d} onThreeD={(on) => setLayer('terrain3d', on)} follow={follow && !!fix} onFollow={setFollow} canFollow={!!fix} />
        {fix && (
          <button className="icon-btn maps-locate" type="button" onClick={() => setFlyTo({ lat: fix.lat, lon: fix.lon, zoom: Math.max(view.zoom, 13), key: Date.now() })} aria-label={t('maps.goHere')}>
            <Locate size={20} />
          </button>
        )}
      </FullscreenStage>
      <p className="hint maps-center" data-testid="map-center">
        {t('maps.center', { coords: formatDms(view, t('geo.westLetter')), zoom: Math.round(view.zoom) })}
      </p>

      {selectedWp && (
        <section className="card row-between" data-testid="map-waypoint">
          <span>
            <MapPin size={16} aria-hidden /> <strong>{selectedWp.name}</strong>
          </span>
          <span className="row-end">
            <Link className="btn" to={`/orientation/waypoints/${selectedWp.id}/go`}>{t('goto.button')}</Link>
            <button className="icon-btn" type="button" onClick={() => setSelected(null)} aria-label={t('common.close')}>
              <X size={18} />
            </button>
          </span>
        </section>
      )}

      <section className="card stack" aria-labelledby="maps-layers">
        <h2 id="maps-layers" className="section-title" style={{ margin: 0 }}>{t('maps.layers')}</h2>
        <div className="chips" role="group" aria-label={t('maps.layers')}>
          {LAYER_KEYS.map((key) => (
            <button key={key} type="button" className="chip" aria-pressed={layers[key]} onClick={() => setLayer(key, !layers[key])}>
              {t(`maps.layer.${key}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="maps-zones">
        <h2 id="maps-zones" className="section-title" style={{ margin: 0 }}>{t('maps.zones')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('maps.zonesHint')}</p>
        {message && <p className="hint" role="status" data-testid="zone-message">{message}</p>}

        {panel ? (
          <div className="stack" data-testid="zone-panel">
            <div className="field">
              <label htmlFor="zone-name">{t('maps.zoneName')}</label>
              <input id="zone-name" className="input" value={panel.name} onChange={(e) => setPanel({ ...panel, name: e.target.value })} disabled={!!progress} />
            </div>
            <div className="field">
              <label htmlFor="zone-radius">{t('maps.radius')}</label>
              <select id="zone-radius" className="select" value={panel.radiusKm} onChange={(e) => setPanel({ ...panel, radiusKm: Number(e.target.value) })} disabled={!!progress}>
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {t('maps.km', { count: r })}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="zone-detail">{t('maps.detail')}</label>
              <select id="zone-detail" className="select" value={panel.detail} onChange={(e) => setPanel({ ...panel, detail: e.target.value as DetailId })} disabled={!!progress}>
                {DETAILS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {t(`maps.details.${d.id}`)}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('maps.centerHint')}</p>
            {plan && (
              <p className={plan.withinLimits ? 'hint' : 'error'} style={{ margin: 0 }} data-testid="zone-estimate">
                {t('maps.estimate', { tiles: plan.vectorTiles + plan.demTiles, mb: mb(plan.bytes) })}
                {!plan.withinLimits && ` ${t('maps.tooBig')}`}
              </p>
            )}
            {progress && (
              <div role="status" aria-live="polite">
                <span className="progress">
                  <span className="progress-bar" style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
                </span>
                <span className="hint">{t('maps.progress', { done: progress.done, total: progress.total, mb: mb(progress.bytes) })}</span>
              </div>
            )}
            <div className="row-end">
              {progress ? (
                <button className="btn" type="button" onClick={() => abort?.abort()}>
                  {t('common.cancel')}
                </button>
              ) : (
                <>
                  <button className="btn" type="button" onClick={() => setPanel(null)}>
                    {t('common.cancel')}
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => void startDownload()} disabled={!online || !plan?.withinLimits}>
                    <Download size={18} /> {t('maps.download')}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" type="button" onClick={openPanel} disabled={!online}>
            <Download size={18} /> {t('maps.downloadHere')}
          </button>
        )}

        {zones.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>{t('maps.noZones')}</p>
        ) : (
          <ul className="list" data-testid="zone-list">
            {zones.map((z) => (
              <li key={z.id} className="list-row">
                <button className="list-main zone-go" type="button" onClick={() => setFlyTo({ lat: z.lat, lon: z.lon, zoom: 11, key: Date.now() })}>
                  <span className="list-title">{z.name}</span>
                  <span className="list-sub">
                    {missing.has(z.id)
                      ? t('maps.notOnDevice')
                      : t('maps.zoneSummary', { km: z.radiusKm, mb: mb(z.bytes), date: new Date(z.createdAt).toLocaleDateString(i18n.language) })}
                  </span>
                </button>
                <button className="icon-btn" type="button" onClick={() => void handleRemove(z)} aria-label={t('maps.delete', { name: z.name })}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {usage !== null && <p className="hint" style={{ margin: 0 }}>{t('maps.usage', { mb: mb(usage) })}</p>}
      </section>

      <p className="hint">{t('maps.attribution')}</p>
    </div>
  );
}

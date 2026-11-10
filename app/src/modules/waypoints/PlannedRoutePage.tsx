import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Footprints, Map as MapIcon, MapPinPlus, Trash2 } from 'lucide-react';
import type { Route } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { Profile } from '@/modules/maps/MapTools';
import { summarizePath, type PathSummary } from '@/modules/maps/measure';
import { toGpx } from '@/modules/training/interchange';
import { useTracks } from '@/modules/tracks/store';
import { deliverFile } from '@/ui/files';
import { toKml } from './kml';
import { legsOf, lineLength, trackFromRoute } from './plan';
import { useWaypoints } from './store';
import type { NewWaypointDraft } from './WaypointEditPage';
import { confirmAction } from '@/ui/confirm';

/**
 * Una ruta planificada en el mapa: sus piernas (distancia y rumbo magnético),
 * el desnivel y el perfil, y qué hacer con ella: verla en el mapa, exportarla,
 * guardar un punto como lugar o seguirla. Sus puntos no son waypoints: solo
 * los que se guardan a mano como lugar entran en esa lista.
 */
export function PlannedRoutePage({ route }: { route: Route }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const saveRoute = useWaypoints((s) => s.saveRoute);
  const deleteRoute = useWaypoints((s) => s.deleteRoute);
  const tracks = useTracks((s) => s.tracks);
  const saveTrack = useTracks((s) => s.saveTrack);
  const line = route.line ?? [];
  const legs = legsOf(line);
  const dist = (m: number) => formatDistance(m, units, i18n.language);
  const alt = (m: number) => formatAltitude(m, units, i18n.language);
  const [summary, setSummary] = useState<PathSummary | null>(null);
  const [name, setName] = useState(route.name);
  useEffect(() => {
    let cancelled = false;
    void summarizePath(line).then((s) => !cancelled && setSummary(s));
    return () => {
      cancelled = true;
    };
  }, [route.id, line.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /** El track de esta ruta (se crea la primera vez y se actualiza si la ruta cambió): sirve para seguirla y verla en el mapa. */
  async function ensureTrack() {
    const existing = [...tracks.values()].find((x) => x.routeId === route.id);
    const track = trackFromRoute(route, existing);
    await saveTrack(track);
    return track;
  }

  async function exportKml() {
    const file = `${route.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'ruta'}.kml`;
    try {
      await deliverFile(new TextEncoder().encode(toKml(route.name, line)) as Uint8Array<ArrayBuffer>, file, 'application/vnd.google-earth.kml+xml');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
  }

  async function exportGpx() {
    const text = toGpx({ name: route.name, kind: 'walk', startedAt: new Date().toISOString(), segments: [line.map((p) => [p.lat, p.lon, null])] });
    const file = `${route.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'ruta'}.gpx`;
    try {
      await deliverFile(new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>, file, 'application/gpx+xml');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
  }

  return (
    <div className="stack" data-testid="planned-route">
      <div className="page-head">
        <input
          className="input page-title"
          style={{ flex: 1 }}
          value={name}
          aria-label={t('routes.name')}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== route.name && void saveRoute({ ...route, name: name.trim() })}
        />
      </div>
      <section className="card stack">
        <p className="measure-big" data-testid="planned-distance">
          {dist(lineLength(line))}
          <span className="hint"> · {t('mapTools.legs', { count: legs.length })}</span>
        </p>
        {summary?.ascent != null ? (
          <>
            <p style={{ margin: 0 }} data-testid="planned-climb">{t('mapTools.climb', { up: alt(summary.ascent), down: alt(summary.descent!) })}</p>
            <Profile profile={summary.profile} />
            <p className="hint" style={{ margin: 0 }}>{t('mapTools.demNote')}</p>
          </>
        ) : (
          summary && <p className="hint" style={{ margin: 0 }}>{t('mapTools.noDem')}</p>
        )}
        <div className="row wrap">
          <button
            className="btn btn-primary"
            type="button"
            data-testid="planned-follow"
            onClick={async () => {
              const track = await ensureTrack();
              navigate(`/orientation/tracks/${track.id}/follow`);
            }}
          >
            <Footprints size={18} /> {t('routes.follow')}
          </button>
          <button
            className="btn"
            type="button"
            data-testid="planned-map"
            onClick={async () => {
              const track = await ensureTrack();
              navigate(`/orientation/maps?track=${track.id}`);
            }}
          >
            <MapIcon size={18} /> {t('routes.viewOnMap')}
          </button>
          <button className="btn" type="button" data-testid="planned-gpx" onClick={() => void exportGpx()}>
            <Download size={18} /> {t('training.exportGpx')}
          </button>
          <button className="btn" type="button" data-testid="planned-kml" onClick={() => void exportKml()}>
            <Download size={18} /> {t('routes.exportKml')}
          </button>
        </div>
      </section>
      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('routes.legsTitle')}</h2>
        <ol className="list" data-testid="planned-legs">
          {line.map((p, i) => (
            <li key={i} className="list-row">
              <span className="route-index">{i + 1}</span>
              <span className="list-main">
                <span className="list-title">
                  {t('routes.legTo', { n: i + 1 })}
                  {i > 0 && ` · ${dist(legs[i - 1]!.distanceM)}`}
                </span>
                {i > 0 && <span className="list-sub">{t('mapTools.legBearing', { magnetic: Math.round(legs[i - 1]!.magneticBearing), cardinal: legs[i - 1]!.cardinal })}</span>}
              </span>
              <Link
                className="icon-btn"
                to="/orientation/waypoints/new"
                state={{ lat: p.lat, lon: p.lon, alt: null } satisfies NewWaypointDraft}
                aria-label={t('routes.saveAsPlace', { n: i + 1 })}
                title={t('routes.saveAsPlace', { n: i + 1 })}
              >
                <MapPinPlus size={18} />
              </Link>
            </li>
          ))}
        </ol>
        <p className="hint" style={{ margin: 0 }}>{t('routes.pointsNotPlaces')}</p>
      </section>
      <div className="row-end">
        <button
          className="btn btn-danger-outline"
          type="button"
          onClick={async () => {
            if (!(await confirmAction(t('routes.confirmDelete', { name: route.name })))) return;
            const existing = [...tracks.values()].find((x) => x.routeId === route.id);
            if (existing) await useTracks.getState().deleteTrack(existing.id);
            await deleteRoute(route.id);
            navigate('/orientation/waypoints', { replace: true });
          }}
        >
          <Trash2 size={18} /> {t('common.delete')}
        </button>
      </div>
    </div>
  );
}

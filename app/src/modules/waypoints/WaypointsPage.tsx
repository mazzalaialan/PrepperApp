import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, MapPinPlus, Plus } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { distanceMeters } from '@/core/geo/geo';
import { currentPosition, GeoPositionError, useGeolocation } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { GpsStatus, useDistanceLabel } from './components';
import { useWaypoints } from './store';

const FRESH_FIX_MS = 10_000;

export function WaypointsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const waypoints = useWaypoints((s) => s.waypoints);
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const hasGps = useCapabilities((s) => s.caps?.geolocation ?? false);
  const { fix, error } = useGeolocation(hasGps);
  const distanceLabel = useDistanceLabel();
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = [...waypoints.values()];
    // Con posición, los más cercanos primero; sin posición, por nombre.
    return fix
      ? list.sort((a, b) => distanceMeters(fix, a) - distanceMeters(fix, b))
      : list.sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [waypoints, fix, i18n.language]);

  async function markHere() {
    setMarking(true);
    setMarkError(null);
    try {
      // Si el seguimiento ya tiene una lectura reciente se usa esa: es instantáneo y igual de preciso.
      const here = fix && Date.now() - fix.timestamp < FRESH_FIX_MS ? fix : await currentPosition();
      const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
      const wp = newEntity<Waypoint>({
        name: t('waypoints.defaultName', { when }),
        lat: here.lat,
        lon: here.lon,
        alt: here.alt,
        icon: 'pin',
        notes: '',
      });
      await saveWaypoint(wp);
      navigate(`/orientation/waypoints/${wp.id}`);
    } catch (e) {
      setMarkError(t(`gps.error.${e instanceof GeoPositionError ? e.code : 'unavailable'}`));
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.waypoints.title')}</h1>
        <Link className="btn" to="/orientation/waypoints/new">
          <Plus size={20} /> {t('waypoints.new')}
        </Link>
      </div>

      {hasGps ? (
        <section className="card stack">
          <GpsStatus fix={fix} error={error} />
          <button className="btn btn-primary" type="button" onClick={() => void markHere()} disabled={marking}>
            <MapPinPlus size={20} /> {marking ? t('gps.searching') : t('waypoints.markHere')}
          </button>
          {markError && <p className="error" role="alert">{markError}</p>}
        </section>
      ) : (
        <p className="hint">{t('waypoints.noGps')}</p>
      )}

      {rows.length === 0 ? (
        <p className="empty">{t('waypoints.empty')}</p>
      ) : (
        <ul className="list" style={{ marginTop: 16 }}>
          {rows.map((wp) => (
            <li key={wp.id}>
              <Link className="list-row" to={`/orientation/waypoints/${wp.id}`}>
                <MapPin size={22} aria-hidden style={{ color: 'var(--accent)', flex: 'none' }} />
                <span className="list-main">
                  <span className="list-title">{wp.name}</span>
                  {fix && <span className="list-sub">{distanceLabel(fix, wp)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

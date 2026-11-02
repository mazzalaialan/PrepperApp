import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, Footprints, Map as MapIcon, MapPinPlus, Navigation, Trash2 } from 'lucide-react';
import { distanceMeters } from '@/core/geo/geo';
import { newEntity } from '@/core/model/entity';
import type { Track, Waypoint } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { useWaypoints } from '@/modules/waypoints/store';
import { useTracks } from './store';

export function TrackPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const track = useTracks((s) => (id ? s.tracks.get(id) : undefined));
  const loaded = useTracks((s) => s.loaded);
  if (!loaded) return null;
  if (!track) {
    return (
      <p className="empty">
        {t('tracks.notFound')} <Link to="/orientation/tracks">{t('common.back')}</Link>
      </p>
    );
  }
  return <TrackDetail key={track.id} track={track} />;
}

function TrackDetail({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const { saveTrack, deleteTrack } = useTracks();
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const myWaypoints = useWaypoints((s) => s.waypoints);
  const routes = useWaypoints((s) => s.routes);
  const deleteWaypoint = useWaypoints((s) => s.deleteWaypoint);
  const [name, setName] = useState(track.name);
  const [notes, setNotes] = useState(track.notes);
  const [saved, setSaved] = useState(false);
  const dist = (m: number) => formatDistance(m, units, i18n.language);
  const alt = (m: number) => formatAltitude(m, units, i18n.language);

  /** Mis waypoints en el mismo lugar que un punto del track (a menos de 20 m). */
  const sameSpot = (w: { lat: number; lon: number }) => [...myWaypoints.values()].filter((m) => distanceMeters(m, w) < 20);
  /** La copia de este punto: mismo lugar y mismo nombre (o la nota de copiado), para no borrar un waypoint propio que esté ahí. */
  const copyOf = (w: Track['waypoints'][number]) =>
    sameSpot(w).find((m) => m.name.trim() === w.name.trim() || m.notes === t('tracks.copiedFrom', { name: track.name }));

  async function copyToMine(w: Track['waypoints'][number]) {
    await saveWaypoint(
      newEntity<Waypoint>({ name: w.name, lat: w.lat, lon: w.lon, alt: w.ele, icon: 'pin', notes: t('tracks.copiedFrom', { name: track.name }), rainAlerts: false }),
    );
  }

  async function removeCopy(copy: Waypoint) {
    // Si lo usa alguna ruta, se avisa antes: la ruta sigue sin ese punto.
    const inRoutes = [...routes.values()].filter((r) => r.waypointIds.includes(copy.id));
    if (inRoutes.length && !window.confirm(t('tracks.confirmUncopy', { name: copy.name, routes: inRoutes.map((r) => r.name).join(', ') }))) return;
    await deleteWaypoint(copy.id);
  }

  async function save() {
    await saveTrack({ ...track, name: name.trim() || track.name, notes });
    setSaved(true);
  }

  async function remove() {
    if (!window.confirm(t('tracks.confirmDelete', { name: track.name }))) return;
    await deleteTrack(track.id);
    navigate('/orientation/tracks', { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/orientation/tracks" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{track.name}</h1>
      </div>

      <section className="card stack" aria-labelledby="track-stats">
        <h2 id="track-stats" className="sr-only">{t('tracks.stats')}</h2>
        <dl className="track-stats" data-testid="track-stats">
          <div>
            <dt>{t('tracks.distance')}</dt>
            <dd>{dist(track.distanceM)}</dd>
          </div>
          <div>
            <dt>{t('tracks.ascent')}</dt>
            <dd>{alt(track.ascentM)}</dd>
          </div>
          <div>
            <dt>{t('tracks.descent')}</dt>
            <dd>{alt(track.descentM)}</dd>
          </div>
          {track.maxEle !== null && (
            <div>
              <dt>{t('tracks.maxEle')}</dt>
              <dd>{alt(track.maxEle)}</dd>
            </div>
          )}
        </dl>
        <ElevationProfile track={track} />
        <div className="row-end wrap">
          <Link className="btn" to={`/orientation/maps?track=${track.id}`}>
            <MapIcon size={18} /> {t('tracks.onMap')}
          </Link>
          {track.segments.flat().length > 1 && (
            <Link className="btn btn-primary" to={`/orientation/tracks/${track.id}/follow`}>
              <Footprints size={18} /> {t('tracks.follow.start')}
            </Link>
          )}
        </div>
        {track.desc && <p className="hint track-desc">{track.desc}</p>}
        <p className="hint" style={{ margin: 0 }}>
          {t('tracks.source', { source: track.source })}
          {track.link && (
            <>
              {' · '}
              <a href={track.link} target="_blank" rel="noreferrer">
                {t('tracks.original')} <ExternalLink size={12} aria-hidden />
              </a>
            </>
          )}
        </p>
      </section>

      <section className="card stack" aria-labelledby="track-points">
        <h2 id="track-points" className="section-title" style={{ margin: 0 }}>
          {t('tracks.points')}
        </h2>
        <p className="hint" style={{ margin: 0 }}>{t('tracks.pointsHint')}</p>
        {track.waypoints.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('tracks.noPoints')}</p>
        ) : (
          <ul className="list" data-testid="track-points">
            {track.waypoints.map((w, i) => {
              const copy = copyOf(w);
              // Hay un waypoint propio ahí que no es esta copia: no se copia de nuevo ni se borra desde acá.
              const taken = !copy && sameSpot(w).length > 0;
              const label = copy ? t('tracks.uncopy', { name: w.name }) : taken ? t('tracks.copied', { name: w.name }) : t('tracks.copy', { name: w.name });
              return (
                <li key={i} className="contact-row">
                  <span className="list-main">
                    <span className="list-title">{w.name}</span>
                    {(w.ele !== null || w.desc) && <span className="list-sub">{[w.ele !== null ? alt(w.ele) : '', w.desc].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <span className="contact-actions">
                    <Link className="icon-btn" to={`/orientation/tracks/${track.id}/go/${i}`} aria-label={t('tracks.goTo', { name: w.name })}>
                      <Navigation size={18} />
                    </Link>
                    <button
                      className="icon-btn"
                      type="button"
                      disabled={taken}
                      aria-pressed={!!copy}
                      onClick={() => void (copy ? removeCopy(copy) : copyToMine(w))}
                      aria-label={label}
                      title={label}
                    >
                      {copy || taken ? <Check size={18} /> : <MapPinPlus size={18} />}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack">
        <div className="field">
          <label htmlFor="track-name">{t('tracks.name')}</label>
          <input
            id="track-name"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="track-notes">{t('tracks.notes')}</label>
          <textarea
            id="track-notes"
            className="input textarea"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        {saved && <p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          <button className="btn btn-danger-outline" type="button" onClick={() => void remove()}>
            <Trash2 size={18} /> {t('common.delete')}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void save()}>
            {t('common.save')}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Perfil de altura: distancia recorrida contra altura. */
function ElevationProfile({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const path = useMemo(() => {
    const pts: [number, number][] = [];
    let acc = 0;
    for (const seg of track.segments) {
      for (let i = 0; i < seg.length; i++) {
        const [lat, lon, ele] = seg[i]!;
        if (i > 0) acc += distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat, lon });
        if (ele !== null) pts.push([acc, ele]);
      }
    }
    if (pts.length < 2 || track.minEle === null || track.maxEle === null) return null;
    const W = 300;
    const H = 80;
    const span = Math.max(1, track.maxEle - track.minEle);
    const total = Math.max(1, acc);
    const line = pts.map(([d, e]) => `${((d / total) * W).toFixed(1)},${(H - ((e - track.minEle!) / span) * (H - 6) - 3).toFixed(1)}`).join(' ');
    return { line, area: `0,${H} ${line} ${W},${H}` };
  }, [track]);
  if (!path) return null;
  return (
    <figure className="track-profile" data-testid="track-profile">
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={t('tracks.profile')}>
        <polygon points={path.area} className="track-profile-area" />
        <polyline points={path.line} className="track-profile-line" fill="none" />
      </svg>
      <figcaption className="hint">
        {t('tracks.profileRange', {
          min: formatAltitude(track.minEle!, units, i18n.language),
          max: formatAltitude(track.maxEle!, units, i18n.language),
        })}
      </figcaption>
    </figure>
  );
}

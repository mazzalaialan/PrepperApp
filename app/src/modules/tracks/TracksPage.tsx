import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Footprints, Trash2, Upload } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { GpxError } from './gpx';
import { trackFromGpx, useTracks } from './store';

/** Tracks importados de un GPX (Wikiloc u otra app): aparte de los waypoints y rutas propios. */
export function TracksPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const tracks = useTracks((s) => s.tracks);
  const saveTrack = useTracks((s) => s.saveTrack);
  const deleteTrack = useTracks((s) => s.deleteTrack);
  async function remove(id: string, name: string) {
    if (window.confirm(t('tracks.confirmDelete', { name }))) await deleteTrack(id);
  }
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useMemo(() => [...tracks.values()].sort((a, b) => a.name.localeCompare(b.name, i18n.language)), [tracks, i18n.language]);

  async function handleFile(f: File) {
    setError(null);
    try {
      const track = trackFromGpx(await f.text(), f.name);
      await saveTrack(track);
      navigate(`/orientation/tracks/${track.id}`);
    } catch (err) {
      if (!(err instanceof GpxError)) throw err;
      setError(t(`tracks.error.${err.code}`));
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/orientation" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.tracks.title')}</h1>
        <button className="btn btn-primary" type="button" onClick={() => file.current?.click()}>
          <Upload size={18} /> {t('tracks.import')}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        hidden
        data-testid="tracks-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {list.length === 0 ? (
        <p className="empty">{t('tracks.empty')}</p>
      ) : (
        <ul className="list" data-testid="tracks-list">
          {list.map((tr) => (
            <li key={tr.id} className="track-row">
              <Link className="list-row" to={`/orientation/tracks/${tr.id}`}>
                <Footprints size={22} aria-hidden className="contact-icon" />
                <span className="list-main">
                  <span className="list-title">{tr.name}</span>
                  <span className="list-sub">
                    {[
                      formatDistance(tr.distanceM, units, i18n.language),
                      tr.ascentM ? `↑ ${formatAltitude(tr.ascentM, units, i18n.language)} ↓ ${formatAltitude(tr.descentM, units, i18n.language)}` : '',
                      tr.waypoints.length ? t('tracks.pointCount', { count: tr.waypoints.length }) : '',
                      tr.source,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
              <button className="icon-btn" type="button" onClick={() => void remove(tr.id, tr.name)} aria-label={t('tracks.delete', { name: tr.name })} title={t('tracks.delete', { name: tr.name })}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{t('tracks.howTo')}</p>
    </div>
  );
}

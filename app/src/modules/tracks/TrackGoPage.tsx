import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { Waypoint } from '@/core/model/types';
import { GoTo } from '@/modules/waypoints/GoToPage';
import { trackEnds, useTracks } from './store';

/**
 * Ir a un lugar del track (inicio, final o uno de sus puntos) con la brújula,
 * sin agregarlo a mis waypoints: se arma un waypoint de paso.
 */
export function TrackGoPage() {
  const { id, target } = useParams();
  const { t } = useTranslation();
  const track = useTracks((s) => (id ? s.tracks.get(id) : undefined));
  const loaded = useTracks((s) => s.loaded);
  if (!loaded) return null;

  let point: { name: string; lat: number; lon: number; ele: number | null } | null = null;
  if (track) {
    const { start, end } = trackEnds(track);
    if (target === 'start' && start) point = { name: t('tracks.startOf', { name: track.name }), lat: start[0], lon: start[1], ele: null };
    else if (target === 'end' && end) point = { name: t('tracks.endOf', { name: track.name }), lat: end[0], lon: end[1], ele: null };
    else {
      const w = track.waypoints[Number(target)];
      if (w) point = w;
    }
  }
  if (!track || !point) {
    return (
      <p className="empty">
        {t('tracks.notFound')} <Link to="/orientation/tracks">{t('common.back')}</Link>
      </p>
    );
  }
  const waypoint: Waypoint = {
    id: `track-${track.id}-${target}`,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
    deletedAt: null,
    name: point.name,
    lat: point.lat,
    lon: point.lon,
    alt: point.ele,
    icon: 'pin',
    notes: '',
    rainAlerts: false,
  };
  return <GoTo target={waypoint} backTo={`/orientation/tracks/${track.id}`} />;
}

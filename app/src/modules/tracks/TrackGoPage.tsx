import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { Waypoint } from '@/core/model/types';
import { GoTo } from '@/modules/waypoints/GoToPage';
import { useTracks } from './store';

/**
 * Ir a uno de los puntos del track con la brújula, sin agregarlo a mis
 * waypoints: se arma un waypoint de paso.
 */
export function TrackGoPage() {
  const { id, target } = useParams();
  const { t } = useTranslation();
  const track = useTracks((s) => (id ? s.tracks.get(id) : undefined));
  const loaded = useTracks((s) => s.loaded);
  if (!loaded) return null;

  const point = track?.waypoints[Number(target)];
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

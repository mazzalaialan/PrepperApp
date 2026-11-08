import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { distanceMeters } from '@/core/geo/geo';
import type { Track } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude } from '@/core/units/units';

/** Perfil de altura: distancia recorrida contra altura. */
export function ElevationProfile({ track }: { track: Track }) {
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

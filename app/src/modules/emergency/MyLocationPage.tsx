import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Phone, RefreshCw, Share2 } from 'lucide-react';
import { bearingDeg, cardinalOf, distanceMeters, formatDms } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useSettings } from '@/core/settings/settings';
import { CALLS } from '@/modules/firstAid/guides/types';
import { useWaypoints } from '@/modules/waypoints/store';
import { describeLocation, type LocationInfo } from './osm';
import { CopyButton, formatDistance } from './parts';

/** Se vuelve a buscar la dirección si te moviste más que esto. */
const RELOOKUP_M = 150;

export function MyLocationPage() {
  const { t, i18n } = useTranslation();
  const { fix, error } = useGeolocation();
  // El número general de emergencias del país (en Chile, Carabineros).
  const emergencyNumber = CALLS[useSettings((s) => s.settings.country)].emergency ?? '911';
  const waypoints = useWaypoints((s) => s.waypoints);
  const [info, setInfo] = useState<LocationInfo | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');
  const lastLookup = useRef<{ lat: number; lon: number } | null>(null);

  async function lookup(lat: number, lon: number) {
    if (!navigator.onLine) {
      setState('offline');
      return;
    }
    lastLookup.current = { lat, lon };
    setState('loading');
    try {
      setInfo(await describeLocation(lat, lon, i18n.language));
      setState('idle');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    if (!fix) return;
    if (!lastLookup.current || distanceMeters(lastLookup.current, fix) > RELOOKUP_M) void lookup(fix.lat, fix.lon);
  }, [fix?.lat, fix?.lon]);

  const nearestWp = useMemo(() => {
    if (!fix) return null;
    let best: { name: string; d: number; bearing: number } | null = null;
    for (const w of waypoints.values()) {
      const d = distanceMeters(fix, w);
      if (!best || d < best.d) best = { name: w.name, d, bearing: bearingDeg(w, fix) };
    }
    return best;
  }, [fix, waypoints]);

  const west = t('geo.westLetter');
  const decimal = fix ? `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}` : '';
  const mapUrl = fix ? `https://www.google.com/maps/search/?api=1&query=${fix.lat.toFixed(6)},${fix.lon.toFixed(6)}` : '';

  const message = useMemo(() => {
    if (!fix) return '';
    const lines = [
      t('location.msg.intro'),
      t('location.msg.coords', { decimal, dms: formatDms(fix, west), accuracy: Math.round(fix.accuracy) }),
    ];
    if (info?.address || info?.locality) lines.push(t('location.msg.address', { address: [info.address, info.locality].filter(Boolean).join(', ') }));
    if (info?.nearbyStreets.length) lines.push(t('location.msg.streets', { streets: info.nearbyStreets.join(t('location.and')) }));
    if (info?.roads.length) lines.push(t('location.msg.road', { road: info.roads.join(' / ') }) + (info.milestone ? ` ${t('location.msg.km', { km: info.milestone.km })}` : ''));
    if (nearestWp && nearestWp.d < 20_000) {
      lines.push(t('location.msg.waypoint', { distance: formatDistance(nearestWp.d, i18n.language), dir: t(`geo.cardinal.${cardinalOf(nearestWp.bearing)}`), name: nearestWp.name }));
    }
    if (fix.alt !== null) lines.push(t('location.msg.altitude', { alt: Math.round(fix.alt) }));
    lines.push(t('location.msg.map', { url: mapUrl }));
    return lines.join('\n');
  }, [fix, info, nearestWp, t, i18n.language]);

  async function share() {
    try {
      await navigator.share({ title: t('location.shareTitle'), text: message });
    } catch {
      // Cancelado o sin soporte: queda el botón de copiar.
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.myLocation.title')}</h1>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('location.intro')}</p>

      {!fix ? (
        <p className={error ? 'error' : 'hint'} role="status">
          {error ? t(`location.gpsError.${error}`) : t('location.waiting')}
        </p>
      ) : (
        <>
          <section className="card stack location-card" aria-label={t('location.coordsTitle')}>
            <h2 className="section-title" style={{ margin: 0 }}>{t('location.coordsTitle')}</h2>
            <p className="location-big" data-testid="location-decimal">
              {decimal}
            </p>
            <p className="location-dms" data-testid="location-dms">{formatDms(fix, west)}</p>
            <p className="hint" style={{ margin: 0 }}>
              {t('location.accuracy', { m: Math.round(fix.accuracy) })}
              {fix.alt !== null && ` · ${t('location.altitude', { m: Math.round(fix.alt) })}`}
            </p>
            <div className="row-end">
              <CopyButton text={decimal} label={t('location.copyCoords')} />
              <a className="btn" href={mapUrl} target="_blank" rel="noreferrer">
                {t('emergency.openMaps')}
              </a>
            </div>
          </section>

          <section className="card stack" aria-labelledby="ref-title">
            <div className="row-between">
              <h2 id="ref-title" className="section-title" style={{ margin: 0 }}>{t('location.referencesTitle')}</h2>
              <button className="icon-btn" type="button" onClick={() => void lookup(fix.lat, fix.lon)} disabled={state === 'loading'} aria-label={t('location.refresh')}>
                <RefreshCw size={18} />
              </button>
            </div>
            {state === 'loading' && <p className="hint">{t('location.searching')}</p>}
            {state === 'offline' && <p className="hint">{t('location.offline')}</p>}
            {state === 'error' && <p className="hint">{t('location.lookupError')}</p>}
            {info && (
              <dl className="location-refs" data-testid="location-refs">
                {(info.address || info.locality) && (
                  <>
                    <dt>{t('location.address')}</dt>
                    <dd>{[info.address, info.locality].filter(Boolean).join(', ')}</dd>
                  </>
                )}
                {info.nearbyStreets.length > 0 && (
                  <>
                    <dt>{t('location.streets')}</dt>
                    <dd>{info.nearbyStreets.join(t('location.and'))}</dd>
                  </>
                )}
                {info.roads.length > 0 && (
                  <>
                    <dt>{t('location.road')}</dt>
                    <dd>
                      {info.roads.join(' / ')}
                      {info.milestone && ` · ${t('location.km', { km: info.milestone.km, distance: formatDistance(info.milestone.distance, i18n.language) })}`}
                    </dd>
                  </>
                )}
              </dl>
            )}
            {nearestWp && (
              <p className="hint" style={{ margin: 0 }} data-testid="location-waypoint">
                {t('location.fromWaypoint', { distance: formatDistance(nearestWp.d, i18n.language), dir: t(`geo.cardinal.${cardinalOf(nearestWp.bearing)}`), name: nearestWp.name })}
              </p>
            )}
          </section>

          <section className="card stack" aria-labelledby="msg-title">
            <h2 id="msg-title" className="section-title" style={{ margin: 0 }}>{t('location.messageTitle')}</h2>
            <pre className="location-message" data-testid="location-message">{message}</pre>
            <div className="row-end wrap">
              <CopyButton text={message} label={t('location.copyMessage')} />
              {'share' in navigator && (
                <button className="btn" type="button" onClick={() => void share()}>
                  <Share2 size={18} /> {t('location.share')}
                </button>
              )}
              <a className="btn" href={`sms:?&body=${encodeURIComponent(message)}`}>
                <MessageSquare size={18} /> {t('location.sms')}
              </a>
              <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                {t('location.whatsapp')}
              </a>
            </div>
          </section>
        </>
      )}

      <a className="btn btn-danger call-911" href={`tel:${emergencyNumber}`}>
        <Phone size={20} /> {t('location.call911', { number: emergencyNumber })}
      </a>
      <p className="hint">{t('location.sources')}</p>
    </div>
  );
}

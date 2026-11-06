import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Camera, CameraOff, ChevronLeft, ChevronRight, CircleCheck, MapPin } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { bearingDeg, distanceMeters, normalizeDeg } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import type { Waypoint } from '@/core/model/types';
import { angleDiff } from '@/core/sensors/heading';
import { useCamera, visibleFov } from '@/core/sensors/useCamera';
import { useHeading, type Heading } from '@/core/sensors/useHeading';
import { useBatterySaver } from '@/core/power/saver';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { CompassRose } from '@/modules/compass/CompassRose';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { GpsStatus, useFormatBearing } from './components';
import { useWaypoints } from './store';

/** Se considera que llegaste dentro de este radio (o de la precisión del GPS, si es peor). */
const ARRIVAL_M = 15;
/** Por debajo de este desvío se indica "seguí derecho". */
const ON_COURSE_DEG = 10;

export function GoToPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const target = useWaypoints((s) => (id ? s.waypoints.get(id) : undefined));
  const loaded = useWaypoints((s) => s.loaded);
  if (!loaded) return null;
  if (!target) {
    return (
      <p className="empty">
        {t('waypoints.notFound')} <Link to="/orientation/waypoints">{t('common.back')}</Link>
      </p>
    );
  }
  return <GoTo target={target} backTo={`/orientation/waypoints/${target.id}`} />;
}

/** Recorrido de una ruta: en qué punto va y cómo pasar al siguiente. */
export interface RouteStep {
  name: string;
  step: number;
  total: number;
  next: Waypoint | undefined;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

export function GoTo({ target, backTo, route }: { target: Waypoint; backTo: string; route?: RouteStep }) {
  const { t, i18n } = useTranslation();
  const caps = useCapabilities((s) => s.caps);
  const units = useSettings((s) => s.settings.units);
  const formatBearing = useFormatBearing();
  const { fix, error } = useGeolocation();
  const heading = useHeading(fix, caps?.orientation ?? false);
  const canAr = (caps?.camera && caps.orientation) ?? false;
  const saver = useBatterySaver();
  // `null` = automático: prendida si el dispositivo puede (la detección de sensores tarda un instante),
  // salvo con ahorro de batería, donde la cámara se prende a mano.
  const [cameraChoice, setCameraOn] = useState<boolean | null>(null);
  const cameraOn = cameraChoice ?? (canAr && !saver);

  const distance = fix ? distanceMeters(fix, target) : null;
  const trueBearing = fix ? bearingDeg(fix, target) : null;
  const arrived = distance !== null && fix !== null && distance <= Math.max(ARRIVAL_M, fix.accuracy);
  // Rumbo al punto en la referencia de la brújula (geográfica o magnética).
  const shownBearing =
    trueBearing === null ? null : heading?.reference === 'magnetic' && heading.declination !== null ? normalizeDeg(trueBearing - heading.declination) : trueBearing;
  const turn = heading?.trueHeading != null && trueBearing !== null ? angleDiff(heading.trueHeading, trueBearing) : null;

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to={backTo} aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{t('goto.title', { name: target.name })}</h1>
          {route && (
            <p className="hint" style={{ margin: 0 }} data-testid="route-step">
              {t('routes.stepOf', { route: route.name, step: route.step, total: route.total })}
            </p>
          )}
        </div>
        {canAr && (
          <button className="icon-btn" type="button" aria-pressed={cameraOn} onClick={() => setCameraOn(!cameraOn)} aria-label={cameraOn ? t('goto.cameraOff') : t('goto.cameraOn')} title={cameraOn ? t('goto.cameraOff') : t('goto.cameraOn')}>
            {cameraOn ? <CameraOff size={22} /> : <Camera size={22} />}
          </button>
        )}
      </div>

      <section className="card nav-readout">
        <div>
          <span className="nav-label">{t('waypoints.distance')}</span>
          <span className="nav-value" data-testid="goto-distance">{distance === null ? '—' : formatDistance(distance, units, i18n.language)}</span>
        </div>
        <div>
          <span className="nav-label">{t('waypoints.bearing')}</span>
          <span className="nav-value" data-testid="goto-bearing">{shownBearing === null ? '—' : formatBearing(shownBearing)}</span>
        </div>
      </section>

      {route && (
        <div className="row-between">
          <button className="btn" type="button" onClick={route.onPrev ?? undefined} disabled={!route.onPrev}>
            <ChevronLeft size={18} /> {t('routes.previous')}
          </button>
          <button className={arrived ? 'btn btn-primary' : 'btn'} type="button" onClick={route.onNext ?? undefined} disabled={!route.onNext}>
            {route.next ? t('routes.nextPoint', { name: route.next.name }) : t('routes.lastPoint')} <ChevronRight size={18} />
          </button>
        </div>
      )}

      {arrived ? (
        <p className="goto-arrived" role="status">
          <CircleCheck size={28} aria-hidden /> {route && !route.next ? t('routes.finished') : t('goto.arrived')}
        </p>
      ) : !caps?.orientation ? (
        <p className="hint">{t('goto.noCompass')}</p>
      ) : !fix ? null : !heading ? (
        <p className="hint">{t('compass.waiting')}</p>
      ) : cameraOn && heading.mode === 'upright' ? (
        <ArView target={target} heading={heading} turn={turn} distanceLabel={distance === null ? '' : formatDistance(distance, units, i18n.language)} />
      ) : (
        <>
          <TurnHint turn={turn} />
          <CompassRose heading={heading.heading} target={shownBearing} />
          {cameraOn && <p className="hint" style={{ textAlign: 'center' }}>{t('goto.raisePhone')}</p>}
        </>
      )}

      <GpsStatus fix={fix} error={error} />
    </div>
  );
}

function TurnHint({ turn }: { turn: number | null }) {
  const { t } = useTranslation();
  if (turn === null) return null;
  const degrees = Math.round(Math.abs(turn));
  return (
    <p className="goto-turn" data-testid="goto-turn" role="status">
      {Math.abs(turn) <= ON_COURSE_DEG ? (
        <>
          <ArrowUp size={28} aria-hidden /> {t('goto.straight')}
        </>
      ) : turn > 0 ? (
        <>
          {t('goto.turnRight', { degrees })} <ChevronRight size={28} aria-hidden />
        </>
      ) : (
        <>
          <ChevronLeft size={28} aria-hidden /> {t('goto.turnLeft', { degrees })}
        </>
      )}
    </p>
  );
}

/** Cámara con un marcador sobre el horizonte en la dirección del punto. */
function ArView({ target, heading, turn, distanceLabel }: { target: Waypoint; heading: Heading; turn: number | null; distanceLabel: string }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const { ready, error } = useCamera(video, true);
  const fov = video.current && ready ? visibleFov(video.current) : { h: 50, v: 65 };
  const inView = turn !== null && Math.abs(turn) < fov.h / 2;
  // El punto se dibuja sobre el horizonte: si la cámara mira hacia arriba, baja en pantalla.
  const x = turn === null ? 50 : 50 + (turn / fov.h) * 100;
  const y = Math.max(8, Math.min(92, 50 + (heading.pitch / fov.v) * 100));

  if (error) return <p className="error">{t(`goto.cameraError.${error}`)}</p>;

  const turnText =
    turn === null
      ? null
      : Math.abs(turn) <= ON_COURSE_DEG
        ? t('goto.straight')
        : turn > 0
          ? t('goto.turnRight', { degrees: Math.round(turn) })
          : t('goto.turnLeft', { degrees: Math.round(-turn) });

  return (
    <FullscreenStage
      className="ar-view"
      overlay={
        <>
          <span className="fs-big">
            {target.name} · {distanceLabel}
          </span>
          {turnText && <span>{turnText}</span>}
        </>
      }
    >
      <video ref={video} className="ar-video" playsInline muted />
      <div className="ar-horizon" style={{ top: `${y}%` }} />
      {inView ? (
        <div className="ar-marker" style={{ left: `${x}%`, top: `${y}%` }} data-testid="ar-marker">
          <MapPin size={40} aria-hidden />
          <span className="ar-label">
            {target.name}
            <br />
            {distanceLabel}
          </span>
        </div>
      ) : (
        turn !== null && (
          <div className={`ar-edge ${turn > 0 ? 'ar-edge-right' : 'ar-edge-left'}`} data-testid="ar-edge">
            {turn > 0 ? <ChevronRight size={48} aria-hidden /> : <ChevronLeft size={48} aria-hidden />}
            <span>{turn > 0 ? t('goto.turnRight', { degrees: Math.round(turn) }) : t('goto.turnLeft', { degrees: Math.round(-turn) })}</span>
          </div>
        )
      )}
    </FullscreenStage>
  );
}

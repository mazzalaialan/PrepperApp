import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Box, ChevronLeft, ChevronRight, CircleCheck, Map as MapIcon, Repeat } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { bearingDeg, distanceMeters, normalizeDeg } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import type { Waypoint } from '@/core/model/types';
import { angleDiff } from '@/core/sensors/heading';
import { useHeading } from '@/core/sensors/useHeading';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { CompassRose } from '@/modules/compass/CompassRose';
import { GpsStatus, useFormatBearing } from './components';
import { HorizonGuide } from './HorizonGuide';
import { useWaypoints } from './store';

const GuideMap = lazy(() => import('@/modules/maps/GuideMap').then((m) => ({ default: m.GuideMap })));

type GoMode = 'map' | '3d';

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
  const lastView = useSettings((s) => s.settings.gotoView);
  const updateSettings = useSettings((s) => s.update);
  // La última vista elegida se recuerda (también entre puntos de una ruta); "cambiar la vista" vuelve a preguntar.
  const [picked, setPicked] = useState<GoMode | null>(lastView);
  const hasCompass = caps?.orientation ?? false;
  // Sin brújula (una PC) la vista 3D no sirve: solo queda el mapa, sin preguntar.
  const choice: GoMode | null = caps && !caps.orientation ? 'map' : picked === '3d' && !hasCompass ? null : picked;
  function choose(mode: GoMode | null) {
    setPicked(mode);
    if (mode) void updateSettings({ gotoView: mode });
  }
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
        {choice && hasCompass && (
          <button className="icon-btn" type="button" onClick={() => choose(null)} aria-label={t('goto.changeView')} title={t('goto.changeView')} data-testid="goto-change-view">
            <Repeat size={22} />
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
      ) : !choice ? (
        !caps ? null : (
        <div className="stack" data-testid="goto-choose">
          <p className="hint" style={{ margin: 0 }}>{t('goto.chooseHint')}</p>
          <button className="btn card goto-choice" type="button" onClick={() => choose('map')} data-testid="goto-choose-map">
            <MapIcon size={28} aria-hidden />
            <span>
              <strong>{t('goto.viewMap')}</strong>
              <span className="hint">{t('goto.viewMapHint')}</span>
            </span>
          </button>
          <button className="btn card goto-choice" type="button" onClick={() => choose('3d')} data-testid="goto-choose-3d">
            <Box size={28} aria-hidden />
            <span>
              <strong>{t('goto.view3d')}</strong>
              <span className="hint">{t('goto.view3dHint')}</span>
            </span>
          </button>
        </div>
        )
      ) : choice === 'map' ? (
        fix ? (
          <Suspense fallback={null}>
            <GuideMap
              target={target}
              fix={fix}
              heading={heading?.trueHeading ?? null}
              overlay={
                <>
                  <span className="fs-big">
                    {target.name} · {distance === null ? '' : formatDistance(distance, units, i18n.language)}
                  </span>
                  {turn !== null && <span>{turnLabel(t, turn)}</span>}
                </>
              }
            />
          </Suspense>
        ) : null
      ) : !caps?.orientation ? (
        <p className="hint">{t('goto.noCompass')}</p>
      ) : !fix ? null : !heading ? (
        <p className="hint">{t('compass.waiting')}</p>
      ) : heading.mode === 'upright' && trueBearing !== null ? (
        <HorizonGuide
          bearing={trueBearing}
          place={fix}
          name={target.name}
          distanceLabel={distance === null ? '' : formatDistance(distance, units, i18n.language)}
          turnText={turn === null ? null : turnLabel(t, turn)}
        />
      ) : (
        <>
          <TurnHint turn={turn} />
          <CompassRose heading={heading.heading} target={shownBearing} />
          <p className="hint" style={{ textAlign: 'center' }}>{t('goto.raisePhone')}</p>
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

function turnLabel(t: (k: string, o?: Record<string, unknown>) => string, turn: number): string {
  if (Math.abs(turn) <= ON_COURSE_DEG) return t('goto.straight');
  return turn > 0 ? t('goto.turnRight', { degrees: Math.round(turn) }) : t('goto.turnLeft', { degrees: Math.round(-turn) });
}

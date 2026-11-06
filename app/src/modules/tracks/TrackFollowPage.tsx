import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Circle, CircleCheck, Footprints, TriangleAlert } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { bearingDeg } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import type { Track } from '@/core/model/types';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useHoldLock } from '@/core/security/lockHold';
import { angleDiff } from '@/core/sensors/heading';
import { useHeading } from '@/core/sensors/useHeading';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { GpsStatus, useFormatBearing } from '@/modules/waypoints/components';
import { followState, isOffTrack, prepareFollow, walkingMinutes, type FollowLine } from './follow';
import { firstPoints } from './record';
import { useRecorder } from './recorder';
import { PocketButton, useRecordedLines, useStartRecording } from './Recording';
import { useTracks } from './store';

// MapLibre pesa ~1 MB: se carga recién al elegir ver el track en el mapa.
const FollowMap = lazy(() => import('./FollowMap').then((m) => ({ default: m.FollowMap })));

export function TrackFollowPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const stored = useTracks((s) => (id ? s.tracks.get(id) : undefined));
  // El que se está grabando, con lo último (lo guardado puede venir unos segundos atrás).
  const live = useRecorder((s) => (s.track?.id === id ? s.track : undefined));
  const track = live ?? stored;
  const loaded = useTracks((s) => s.loaded);
  if (!loaded) return null;
  if (!track || track.segments.flat().length < 2) {
    return (
      <p className="empty">
        {t('tracks.notFound')} <Link to="/orientation/tracks">{t('common.back')}</Link>
      </p>
    );
  }
  const back = params.get('back');
  return <Follow key={track.id} track={back ? firstPoints(track, Number(back)) : track} back={!!back} />;
}

/**
 * Seguir un track. Con `back`, volver al origen por el mismo camino: el
 * recorrido grabado hasta ese momento, al revés. El sentido va en la
 * dirección (`rev`), para volver igual después de bloquear la app.
 */
function Follow({ track: current, back }: { track: Track; back: boolean }) {
  const { t, i18n } = useTranslation();
  const caps = useCapabilities((s) => s.caps);
  const units = useSettings((s) => s.settings.units);
  const view = useSettings((s) => s.settings.trackFollowView);
  const rotate = useSettings((s) => s.settings.trackDrawingRotate);
  const update = useSettings((s) => s.update);
  const formatBearing = useFormatBearing();
  const { fix, error } = useGeolocation();
  const heading = useHeading(fix, caps?.orientation ?? false);
  // Fijo desde que se empieza: si es el que se está grabando, la vuelta no se mezcla con la ida.
  const [track] = useState(current);
  const [params, setParams] = useSearchParams();
  const reversed = params.has('rev') ? params.get('rev') === '1' : back;
  const setReversed = (on: boolean) =>
    setParams(
      (p) => {
        p.set('rev', on ? '1' : '0');
        return p;
      },
      { replace: true },
    );
  const line = useMemo(() => prepareFollow(track, reversed), [track, reversed]);
  const state = fix ? followState(line, fix.lat, fix.lon) : null;
  const dist = (m: number) => formatDistance(m, units, i18n.language);
  const alt = (m: number) => formatAltitude(m, units, i18n.language);
  const recStatus = useRecorder((s) => s.status);
  const recorded = useRecordedLines();
  const startRecording = useStartRecording();
  useWakeLock();
  useHoldLock();

  // Fuera del track, con margen para que el aviso no titile; vibra al salir y al llegar.
  const [off, setOff] = useState(false);
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (!fix || !state) return;
    const nowOff = isOffTrack(state.offTrackM, fix.accuracy, off);
    if (nowOff !== off) {
      setOff(nowOff);
      if (nowOff) navigator.vibrate?.([300, 150, 300]);
    }
    if (state.arrived && !arrivedRef.current) navigator.vibrate?.([150, 100, 150, 100, 400]);
    arrivedRef.current = state.arrived;
    // Solo cuando llega una posición nueva o se da vuelta el sentido.
  }, [fix, line]);

  const backBearing = fix && state && off ? bearingDeg(fix, state.nearest) : null;
  const turn = backBearing !== null && heading?.trueHeading != null ? angleDiff(heading.trueHeading, backBearing) : null;
  const minutes = state ? walkingMinutes(state.remainingM, state.upLeftM, state.downLeftM) : null;
  const timeText = minutes === null ? '' : minutes >= 60 ? t('tracks.follow.hours', { h: Math.floor(minutes / 60), m: minutes % 60 }) : t('tracks.follow.minutes', { m: minutes });
  const statusClass = !state ? '' : state.arrived ? ' follow-arrived' : off ? ' follow-off' : ' follow-on';
  const turnText =
    turn === null ? null : Math.abs(turn) <= 15 ? t('goto.straight') : turn > 0 ? t('goto.turnRight', { degrees: Math.round(turn) }) : t('goto.turnLeft', { degrees: Math.round(-turn) });
  const status = !state ? (
    t('tracks.follow.waiting')
  ) : state.arrived ? (
    <>
      <CircleCheck size={24} aria-hidden /> {back ? t('tracks.follow.arrivedBack') : t('tracks.follow.arrived')}
    </>
  ) : off ? (
    <>
      <TriangleAlert size={24} aria-hidden /> {t('tracks.follow.off', { distance: dist(state.offTrackM), bearing: formatBearing(backBearing!) })}
      {turnText && <span className="follow-turn">{turnText}</span>}
    </>
  ) : (
    <>
      <Footprints size={24} aria-hidden /> {t('tracks.follow.on')}
    </>
  );
  // Sobre el mapa en pantalla completa: el estado y lo principal, para no tener que salir a mirarlo.
  const overlay = (
    <div className={`follow-overlay${statusClass}`} data-testid="follow-overlay">
      <span className="fs-big follow-overlay-status">{status}</span>
      {state && !state.arrived && (
        <span>{t('tracks.follow.overlayStats', { left: dist(state.remainingM), up: alt(state.upLeftM), down: alt(state.downLeftM), time: timeText })}</span>
      )}
      {state?.next && !state.arrived && <span>{t('tracks.follow.next', { name: state.next.name, distance: dist(state.next.aheadM) })}</span>}
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to={`/orientation/tracks/${track.id}`} aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{back ? t('tracks.follow.backTitle') : t('tracks.follow.title', { name: track.name })}</h1>
        <button
          className="icon-btn"
          type="button"
          aria-pressed={reversed}
          onClick={() => {
            setReversed(!reversed);
            setOff(false);
          }}
          aria-label={t('tracks.follow.reverse')}
          title={t('tracks.follow.reverse')}
        >
          <ArrowLeftRight size={22} />
        </button>
        <PocketButton />
      </div>
      {back ? (
        <p className="hint" style={{ margin: 0 }}>{t('tracks.follow.backHint')}</p>
      ) : (
        reversed && <p className="hint" style={{ margin: 0 }}>{t('tracks.follow.reversed')}</p>
      )}
      {recStatus === 'idle' && (
        <button className="btn" type="button" onClick={() => void startRecording()}>
          <Circle size={16} fill="currentColor" className="rec-icon" /> {t('tracks.rec.start')}
        </button>
      )}

      <p className={`follow-status${statusClass}`} role="status" data-testid="follow-status">
        {status}
      </p>

      {state && (
        <section className="card stack">
          <dl className="track-stats" data-testid="follow-stats">
            <div>
              <dt>{t('tracks.follow.done')}</dt>
              <dd>{t('tracks.follow.ofTotal', { done: dist(state.alongM), total: dist(line.totalM) })}</dd>
            </div>
            <div>
              <dt>{t('tracks.follow.left')}</dt>
              <dd>{dist(state.remainingM)}</dd>
            </div>
            <div>
              <dt>{t('tracks.follow.climbLeft')}</dt>
              <dd>
                +{alt(state.upLeftM)} / −{alt(state.downLeftM)}
              </dd>
            </div>
            <div>
              <dt>{t('tracks.follow.time')}</dt>
              <dd>{timeText}</dd>
            </div>
          </dl>
          {state.next && (
            <p className="hint" style={{ margin: 0 }} data-testid="follow-next">
              {t('tracks.follow.next', { name: state.next.name, distance: dist(state.next.aheadM) })}
            </p>
          )}
          <p className="hint" style={{ margin: 0 }}>{t('tracks.follow.timeHint')}</p>
        </section>
      )}

      <div className="chips" role="group" aria-label={t('tracks.follow.view')}>
        {(['drawing', 'map'] as const).map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => void update({ trackFollowView: v })}>
            {t(`tracks.follow.views.${v}`)}
          </button>
        ))}
      </div>
      {view === 'map' ? (
        <Suspense fallback={null}>
          <FollowMap
            track={track}
            line={line}
            fix={fix}
            heading={heading?.trueHeading ?? null}
            doneM={state?.alongM ?? 0}
            nearest={state?.nearest ?? null}
            recorded={recorded}
            overlay={overlay}
          />
        </Suspense>
      ) : (
        <>
          <button
            className="chip"
            type="button"
            aria-pressed={rotate}
            onClick={() => void update({ trackDrawingRotate: !rotate })}
            disabled={!caps?.orientation}
            data-testid="drawing-rotate"
          >
            {t('tracks.follow.rotate')}
          </button>
          {!caps?.orientation && <p className="hint" style={{ margin: 0 }}>{t('tracks.follow.rotateNoCompass')}</p>}
          <MiniMap line={line} me={fix} doneM={state?.alongM ?? 0} recorded={recorded} heading={heading?.trueHeading ?? null} rotate={rotate && !!caps?.orientation} />
        </>
      )}
      <GpsStatus fix={fix} error={error} />
    </div>
  );
}

/** Dibujo del recorrido con lo hecho resaltado y dónde estoy (sin mapa de fondo: anda sin nada descargado). */
function MiniMap({
  line,
  me,
  doneM,
  recorded,
  heading,
  rotate,
}: {
  line: FollowLine;
  me: { lat: number; lon: number } | null;
  doneM: number;
  /** Lo grabado, en [lon, lat]. */
  recorded: [number, number][][] | null;
  /** Rumbo geográfico hacia donde mirás (brújula), o null. */
  heading: number | null;
  /** Girar el dibujo con la brújula: lo que tenés adelante queda arriba. */
  rotate: boolean;
}) {
  const { t } = useTranslation();
  const geo = useMemo(() => {
    const k = Math.cos(((line.lat.reduce((a, b) => a + b, 0) / line.lat.length) * Math.PI) / 180);
    const xs = line.lon.map((lon) => lon * k);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...line.lat);
    const maxY = Math.max(...line.lat);
    if (rotate) {
      // Al girar, el dibujo tiene que entrar en cualquier ángulo: se ajusta a un círculo, no al cuadrado.
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const r = Math.max(...xs.map((x, i) => Math.hypot(x - cx, line.lat[i]! - cy))) || 1e-6;
      const R = 135;
      const xy = (lat: number, lon: number): [number, number] => [150 + ((lon * k - cx) / r) * R, 150 - ((lat - cy) / r) * R];
      return { xy, points: line.lat.map((lat, i) => xy(lat, line.lon[i]!)) };
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1e-6;
    const S = 280;
    const offX = (S - ((maxX - minX) / span) * S) / 2 + 10;
    const offY = (S - ((maxY - minY) / span) * S) / 2 + 10;
    const xy = (lat: number, lon: number): [number, number] => [offX + ((lon * k - minX) / span) * S, offY + ((maxY - lat) / span) * S];
    return { xy, points: line.lat.map((lat, i) => xy(lat, line.lon[i]!)) };
  }, [line, rotate]);
  const fmt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const done: [number, number][] = [];
  for (let i = 0; i < geo.points.length && line.along[i]! <= doneM; i++) done.push(geo.points[i]!);
  const start = geo.points[0]!;
  const end = geo.points[geo.points.length - 1]!;
  const pos = me ? geo.xy(me.lat, me.lon) : null;
  const turn = rotate && heading !== null;
  const inside = pos && pos[0] > -20 && pos[0] < 320 && pos[1] > -20 && pos[1] < 320;
  return (
    <figure className="card follow-map" data-testid="follow-map">
      <svg viewBox="0 0 300 300" role="img" aria-label={t('tracks.follow.map')}>
        <g transform={turn ? `rotate(${(-heading!).toFixed(1)} 150 150)` : undefined} data-testid="follow-drawing">
        <polyline points={geo.points.map(fmt).join(' ')} className="follow-line" fill="none" />
        {done.length > 1 && <polyline points={done.map(fmt).join(' ')} className="follow-done" fill="none" />}
        {recorded
          ?.filter((s) => s.length > 1)
          .map((s, i) => (
            <polyline key={i} points={s.map(([lon, lat]) => fmt(geo.xy(lat, lon))).join(' ')} className="follow-rec" fill="none" data-testid="follow-rec" />
          ))}
        <circle cx={start[0]} cy={start[1]} r={5} className="follow-start" />
        <rect x={end[0] - 5} y={end[1] - 5} width={10} height={10} className="follow-end" />
        {pos && inside && <circle cx={pos[0]} cy={pos[1]} r={7} className="follow-me" />}
        {/* Hacia dónde mirás: con el dibujo girado, siempre hacia arriba. */}
        {pos && inside && heading !== null && <path d="M0,-17 L6,-8 L-6,-8 Z" transform={`translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)}) rotate(${heading.toFixed(1)})`} className="follow-heading" />}
        </g>
        {turn && (
          <g transform={`translate(272 28) rotate(${(-heading!).toFixed(1)})`} className="follow-north" data-testid="follow-north">
            <path d="M0,-16 L6,0 L0,-4 L-6,0 Z" />
            <text y={14} textAnchor="middle">
              N
            </text>
          </g>
        )}
      </svg>
      {pos && !inside && <figcaption className="hint">{t('tracks.follow.farAway')}</figcaption>}
    </figure>
  );
}

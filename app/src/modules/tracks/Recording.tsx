import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Circle, Gauge, Moon, Pause, Play, Square, TriangleAlert, Undo2 } from 'lucide-react';
import { usePocket } from '@/core/power/pocket';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { Dialog } from '@/ui/Dialog';
import { MAX_ACCURACY_M } from './record';
import { elapsedS, useRecorder } from './recorder';

/** "0:42", "12:05" o "1:03:20". */
export function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Arranca a grabar con nombre de fecha y hora (se cambia después, en el track). */
export function useStartRecording() {
  const { t, i18n } = useTranslation();
  const start = useRecorder((s) => s.start);
  return () => {
    const now = new Date();
    return start(
      t('tracks.rec.defaultName', {
        date: now.toLocaleDateString(i18n.language),
        time: now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
      }),
    );
  };
}

/** Recorrido grabado como [lon, lat] para el mapa. */
export function useRecordedLines(): [number, number][][] | null {
  const segments = useRecorder((s) => s.track?.segments);
  return useMemo(() => (segments ? segments.map((s) => s.map(([lat, lon]) => [lon, lat] as [number, number])) : null), [segments]);
}

/** Grabar, pausar o seguir grabando, desde el mapa. */
export function RecordButton() {
  const { t } = useTranslation();
  const status = useRecorder((s) => s.status);
  const pause = useRecorder((s) => s.pause);
  const resume = useRecorder((s) => s.resume);
  const start = useStartRecording();
  const label = status === 'idle' ? t('tracks.rec.start') : status === 'recording' ? t('tracks.rec.pause') : t('tracks.rec.resume');
  return (
    <button
      className={`icon-btn maps-camera-btn rec-btn rec-${status}`}
      type="button"
      aria-pressed={status === 'recording'}
      onClick={() => void (status === 'idle' ? start() : status === 'recording' ? pause() : resume())}
      aria-label={label}
      title={label}
    >
      {status === 'recording' ? <Pause size={20} /> : <Circle size={20} fill="currentColor" />}
    </button>
  );
}

export function PocketButton({ labeled = false }: { labeled?: boolean }) {
  const { t } = useTranslation();
  const set = usePocket((s) => s.set);
  return (
    <button className={`icon-btn${labeled ? ' rec-act' : ''}`} type="button" onClick={() => set(true)} aria-label={t('pocket.on')} title={t('pocket.on')}>
      <Moon size={20} />
      {labeled && <span className="rec-lbl">{t('tracks.rec.pocketShort')}</span>}
    </button>
  );
}

/** La pantalla negra: lo grabado en letra tenue y dos toques para volver. */
export function PocketScreen() {
  const { t, i18n } = useTranslation();
  const { on, set } = usePocket();
  const units = useSettings((s) => s.settings.units);
  const { status, track, elapsedMs, since } = useRecorder();
  const lastTap = useRef(0);
  const [, tick] = useState(0);
  useWakeLock(on);
  useEffect(() => {
    if (!on) return;
    // Lo de abajo deja de dibujarse; el tiempo se actualiza cada medio minuto.
    document.documentElement.toggleAttribute('data-pocket', true);
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(id);
      document.documentElement.toggleAttribute('data-pocket', false);
    };
  }, [on]);
  // Al bloquear la app se sale: al volver se ve la pantalla donde estabas.
  useEffect(() => () => set(false), [set]);
  if (!on) return null;
  return (
    <div
      className="pocket"
      role="dialog"
      aria-label={t('pocket.title')}
      data-testid="pocket"
      onPointerDown={() => {
        const now = Date.now();
        if (now - lastTap.current < 450) set(false);
        lastTap.current = now;
      }}
      onKeyDown={(e) => e.key === 'Escape' && set(false)}
      tabIndex={-1}
    >
      {status !== 'idle' && track && (
        <p>
          {status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')} · {formatDistance(track.distanceM, units, i18n.language)} ·{' '}
          {formatDuration(elapsedS({ elapsedMs, since }))}
        </p>
      )}
      {status === 'recording' && <p>{t('pocket.dontLock')}</p>}
      <p>{t('pocket.exit')}</p>
    </div>
  );
}

/**
 * Barra de la grabación, arriba en toda la app mientras se graba o está en
 * pausa: lo recorrido, pausar o seguir, volver al origen y terminar.
 */
export function RecordingBar() {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const units = useSettings((s) => s.settings.units);
  const { status, track, error, elapsedMs, since, accuracy, pause, resume } = useRecorder();
  const [, tick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** Nombre que se está poniendo al terminar (null: sin el diálogo). */
  const [naming, setNaming] = useState<string | null>(null);
  useWakeLock(status === 'recording');
  // El reloj avanza solo mientras graba.
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 15_000);
    return () => clearTimeout(id);
  }, [notice]);

  if (status === 'idle' || !track) {
    return notice ? (
      <p className="rec-notice" role="status">
        {notice}
      </p>
    ) : null;
  }

  const points = track.segments.flat().length;
  // En la pantalla en vivo de Entrenamiento los controles están en grande; acá queda solo el aviso.
  if (pathname === '/training/live') return <RecWarning />;
  const backTo = `/orientation/tracks/${track.id}/follow`;
  const goingBack = pathname === backTo && search.includes('back');
  return (
    <section className={`rec-bar rec-${status}`} aria-label={t('tracks.rec.bar')} data-testid="rec-bar">
      <span className="rec-dot" aria-hidden />
      <span className="rec-info">
        <strong>{status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')}</strong>
        <span data-testid="rec-stats">
          {formatDistance(track.distanceM, units, i18n.language)} · {formatDuration(elapsedS({ elapsedMs, since }))}
        </span>
        {status === 'recording' &&
          (error ? (
            <span className="rec-hint rec-error">{t(`gps.error.${error}`)}</span>
          ) : accuracy === null ? (
            <span className="rec-hint">{t('gps.searching')}</span>
          ) : accuracy > MAX_ACCURACY_M ? (
            // Con tanto error los puntos no se toman: que se vea por qué no avanza.
            <span className="rec-hint rec-error" data-testid="rec-gps">
              {t('tracks.rec.weakGps', { accuracy: formatDistance(accuracy, units, i18n.language), max: formatDistance(MAX_ACCURACY_M, units, i18n.language) })}
            </span>
          ) : (
            points < 2 && <span className="rec-hint">{t('tracks.rec.waitingMove')}</span>
          ))}
      </span>
      <span className="rec-actions">
        {status === 'recording' ? (
          <button className="icon-btn rec-act" type="button" onClick={() => void pause()} aria-label={t('tracks.rec.pause')} title={t('tracks.rec.pause')}>
            <Pause size={20} />
            <span className="rec-lbl">{t('tracks.rec.pauseShort')}</span>
          </button>
        ) : (
          <button className="icon-btn rec-act" type="button" onClick={resume} aria-label={t('tracks.rec.resume')} title={t('tracks.rec.resume')}>
            <Play size={20} />
            <span className="rec-lbl">{t('tracks.rec.resumeShort')}</span>
          </button>
        )}
        {points > 1 && !goingBack && (
          <Link className="icon-btn rec-act" to={`${backTo}?back=${points}`} aria-label={t('tracks.rec.back')} title={t('tracks.rec.back')}>
            <Undo2 size={20} />
            <span className="rec-lbl">{t('tracks.rec.backShort')}</span>
          </Link>
        )}
        {track.activity && (
          <Link className="icon-btn rec-act" to="/training/live" aria-label={t('training.live.open')} title={t('training.live.open')} data-testid="rec-live">
            <Gauge size={20} />
            <span className="rec-lbl">{t('tracks.rec.liveShort')}</span>
          </Link>
        )}
        <PocketButton labeled />
        <button className="icon-btn rec-act rec-finish" type="button" onClick={() => setNaming(track.name)} aria-label={t('tracks.rec.finish')} title={t('tracks.rec.finish')}>
          <Square size={18} fill="currentColor" />
          <span className="rec-lbl">{t('tracks.rec.finishShort')}</span>
        </button>
      </span>
      <RecWarning />
      {naming !== null && <FinishDialog initialName={naming} points={points} onClose={() => setNaming(null)} />}
    </section>
  );
}

/** Aviso de que con el celular bloqueado el navegador no da la posición; si hubo un corte, pregunta qué hacer con el tramo. */
export function RecWarning() {
  const { t, i18n } = useTranslation();
  const { status, warned, gapS, gapFrom, gapTo } = useRecorder();
  const hhmm = (ms: number | null) => (ms === null ? '' : new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms)));
  if (status !== 'recording' || (gapS === null && warned)) return null;
  return (
    <p className="rec-warn" role="alert" data-testid="rec-warn">
      {/* El navegador no da la posición con el celular bloqueado: se avisa al empezar y, si pasó, al volver. */}
      <TriangleAlert size={16} aria-hidden className="rec-warn-icon" />
      <span>{gapS !== null ? t('tracks.rec.gap', { time: formatDuration(gapS), from: hhmm(gapFrom), to: hhmm(gapTo) }) : t('tracks.rec.screenOff')}</span>
      {gapS !== null ? (
        // Se pregunta: dejar el hueco (no suma distancia) o unir con una recta.
        <span className="rec-warn-actions">
          <button className="btn rec-warn-ok" type="button" onClick={() => useRecorder.setState({ warned: true, gapS: null, gapFrom: null, gapTo: null })}>
            {t('tracks.rec.gapKeep')}
          </button>
          <button className="btn rec-warn-ok" type="button" onClick={() => useRecorder.getState().joinGap()}>
            {t('tracks.rec.gapJoin')}
          </button>
        </span>
      ) : (
        <button className="btn rec-warn-ok" type="button" onClick={() => useRecorder.setState({ warned: true })}>
          {t('tracks.rec.understood')}
        </button>
      )}
    </p>
  );
}

/** Al terminar se le pone nombre (mientras tanto sigue grabando); después se cambia en el track. */
export function FinishDialog({ initialName, points, onClose }: { initialName: string; points: number; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const finish = useRecorder((s) => s.finish);
  const [name, setName] = useState(initialName);
  const nothing = points < 2;
  async function stop() {
    onClose();
    const id = await finish(name);
    const workoutId = useRecorder.getState().lastWorkoutId;
    if (workoutId) navigate(`/training/workouts/${workoutId}`);
    else if (id) navigate(`/orientation/tracks/${id}`);
  }
  return (
    <Dialog
      title={t(nothing ? 'tracks.rec.discardTitle' : 'tracks.rec.saveTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('tracks.rec.keepRecording')}
          </button>
          {/* Sin nada que guardar, terminar es descartar: el botón lo dice. */}
          <button className={`btn ${nothing ? 'btn-danger-outline' : 'btn-primary'}`} type="submit" form="rec-save" data-testid={nothing ? 'rec-discard' : 'rec-save-btn'}>
            {t(nothing ? 'tracks.rec.discard' : 'common.save')}
          </button>
        </>
      }
    >
      <form
        id="rec-save"
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          void stop();
        }}
      >
        {nothing ? (
          <p className="error" role="alert">
            {t('tracks.rec.nothingYet')}
          </p>
        ) : (
          <>
            <label htmlFor="rec-name">{t('tracks.name')}</label>
            <input id="rec-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
          </>
        )}
      </form>
    </Dialog>
  );
}

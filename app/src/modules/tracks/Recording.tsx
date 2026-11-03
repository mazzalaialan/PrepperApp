import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Circle, Moon, Pause, Play, Square, TriangleAlert, Undo2 } from 'lucide-react';
import { usePocket } from '@/core/power/pocket';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { Dialog } from '@/ui/Dialog';
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

export function PocketButton() {
  const { t } = useTranslation();
  const set = usePocket((s) => s.set);
  return (
    <button className="icon-btn" type="button" onClick={() => set(true)} aria-label={t('pocket.on')} title={t('pocket.on')}>
      <Moon size={20} />
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
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const units = useSettings((s) => s.settings.units);
  const { status, track, error, elapsedMs, since, warned, gapS, pause, resume, finish } = useRecorder();
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
    const id = setTimeout(() => setNotice(null), 6000);
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
  const backTo = `/orientation/tracks/${track.id}/follow`;
  const goingBack = pathname === backTo && search.includes('back');
  async function stop(name: string) {
    setNaming(null);
    const id = await finish(name);
    if (id) navigate(`/orientation/tracks/${id}`);
    else setNotice(t('tracks.rec.nothing'));
  }

  return (
    <section className={`rec-bar rec-${status}`} aria-label={t('tracks.rec.bar')} data-testid="rec-bar">
      <span className="rec-dot" aria-hidden />
      <span className="rec-info">
        <strong>{status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')}</strong>
        <span data-testid="rec-stats">
          {formatDistance(track.distanceM, units, i18n.language)} · {formatDuration(elapsedS({ elapsedMs, since }))}
        </span>
        {error && status === 'recording' && <span className="rec-hint rec-error">{t(`gps.error.${error}`)}</span>}
      </span>
      <span className="rec-actions">
        {status === 'recording' ? (
          <button className="icon-btn" type="button" onClick={() => void pause()} aria-label={t('tracks.rec.pause')} title={t('tracks.rec.pause')}>
            <Pause size={20} />
          </button>
        ) : (
          <button className="icon-btn" type="button" onClick={resume} aria-label={t('tracks.rec.resume')} title={t('tracks.rec.resume')}>
            <Play size={20} />
          </button>
        )}
        {points > 1 && !goingBack && (
          <Link className="icon-btn" to={`${backTo}?back=${points}`} aria-label={t('tracks.rec.back')} title={t('tracks.rec.back')}>
            <Undo2 size={20} />
          </Link>
        )}
        <PocketButton />
        <button className="icon-btn" type="button" onClick={() => setNaming(track.name)} aria-label={t('tracks.rec.finish')} title={t('tracks.rec.finish')}>
          <Square size={18} fill="currentColor" />
        </button>
      </span>
      {/* El navegador no da la posición con el celular bloqueado: se avisa al empezar y, si pasó, al volver. */}
      {status === 'recording' && (gapS !== null || !warned) && (
        <p className="rec-warn" role="alert" data-testid="rec-warn">
          <TriangleAlert size={16} aria-hidden className="rec-warn-icon" />
          <span>{gapS !== null ? t('tracks.rec.gap', { time: formatDuration(gapS) }) : t('tracks.rec.screenOff')}</span>
          <button className="btn rec-warn-ok" type="button" onClick={() => useRecorder.setState({ warned: true, gapS: null })}>
            {t('tracks.rec.understood')}
          </button>
        </p>
      )}
      {/* Al terminar se le pone nombre (mientras tanto sigue grabando); después se cambia en el track. */}
      {naming !== null && (
        <Dialog
          title={t('tracks.rec.saveTitle')}
          onClose={() => setNaming(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setNaming(null)}>
                {t('tracks.rec.keepRecording')}
              </button>
              <button className="btn btn-primary" type="submit" form="rec-save">
                {t('common.save')}
              </button>
            </>
          }
        >
          <form
            id="rec-save"
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              void stop(naming);
            }}
          >
            <label htmlFor="rec-name">{t('tracks.name')}</label>
            <input id="rec-name" className="input" value={naming} onChange={(e) => setNaming(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
          </form>
        </Dialog>
      )}
    </section>
  );
}

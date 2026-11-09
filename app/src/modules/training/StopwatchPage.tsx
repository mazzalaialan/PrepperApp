import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, Pause, Play, RotateCcw } from 'lucide-react';
import { useWakeLock } from '@/core/power/useWakeLock';
import { Segmented } from '@/ui/Segmented';
import { beep, buzz } from './cues';
import { elapsedMs, timerLeftMs, useStopwatch, useTimer } from './stopwatch';
import { formatDuration, formatStopwatch, stopwatchLaps } from './tools';

/** Cronómetro (con vueltas) y temporizador (cuenta regresiva con aviso al llegar a cero). */
export function StopwatchPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'stopwatch' | 'timer'>('stopwatch');
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.stopwatch.title')}</h1>
      <Segmented<'stopwatch' | 'timer'>
        label={t('stopwatch.mode')}
        value={mode}
        options={[
          { value: 'stopwatch', label: t('stopwatch.stopwatch') },
          { value: 'timer', label: t('stopwatch.timer') },
        ]}
        onChange={setMode}
      />
      {mode === 'stopwatch' ? <Stopwatch /> : <Timer />}
    </div>
  );
}

function useTick(active: boolean, ms = 50) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

function Stopwatch() {
  const { t } = useTranslation();
  const s = useStopwatch();
  useTick(s.running);
  useWakeLock(s.running);
  const now = elapsedMs(s);
  const rows = stopwatchLaps(s.laps);
  const times = rows.map((r) => r.splitMs);
  const fastest = rows.length > 1 ? rows[times.indexOf(Math.min(...times))]!.n : null;
  const slowest = rows.length > 1 ? rows[times.indexOf(Math.max(...times))]!.n : null;
  return (
    <section className="card stack live" data-testid="stopwatch">
      <p className="live-clock" data-testid="sw-time" data-paused={!s.running && now > 0}>
        {formatStopwatch(now)}
      </p>
      <div className="live-actions">
        {s.running ? (
          <button className="live-btn" type="button" onClick={s.pause} data-testid="sw-pause">
            <Pause size={28} /> {t('stopwatch.pause')}
          </button>
        ) : (
          <button className="live-btn live-btn-go" type="button" onClick={s.start} data-testid="sw-start">
            <Play size={28} /> {now > 0 ? t('stopwatch.resume') : t('stopwatch.start')}
          </button>
        )}
        {s.running ? (
          <button className="live-btn" type="button" onClick={s.lap} data-testid="sw-lap">
            <Flag size={24} /> {t('laps.button')}
          </button>
        ) : (
          <button className="live-btn" type="button" onClick={s.reset} disabled={now === 0} data-testid="sw-reset">
            <RotateCcw size={24} /> {t('stopwatch.reset')}
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <table className="bmi-table" data-testid="sw-laps">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t('stopwatch.split')}</th>
              <th scope="col">{t('stopwatch.total')}</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.n} aria-current={r.n === fastest ? 'true' : undefined}>
                <td>{r.n}{r.n === fastest ? ' ▲' : r.n === slowest ? ' ▼' : ''}</td>
                <td>{formatStopwatch(r.splitMs)}</td>
                <td>{formatStopwatch(r.totalMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const PRESETS_S = [60, 180, 300, 600, 900, 1800];

function Timer() {
  const { t } = useTranslation();
  const s = useTimer();
  useTick(s.running, 100);
  useWakeLock(s.running);
  const left = timerLeftMs(s);
  // Al llegar a cero: se detiene y avisa con pitidos y vibración.
  useEffect(() => {
    if (s.running && left <= 0) {
      s.pause();
      s.reset();
      beep(988, 300);
      setTimeout(() => beep(988, 300), 400);
      setTimeout(() => beep(1320, 500), 800);
      buzz([300, 150, 300, 150, 500]);
    }
  });
  return (
    <section className="card stack live" data-testid="timer">
      <p className="live-clock" data-testid="timer-time" data-paused={!s.running}>
        {formatDuration(Math.ceil(left / 1000))}
      </p>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        {PRESETS_S.map((p) => (
          <button key={p} className="btn" type="button" aria-pressed={s.totalS === p} disabled={s.running} onClick={() => s.set(p)} data-testid={`timer-preset-${p}`}>
            {p < 3600 ? `${p / 60} min` : `${p / 3600} h`}
          </button>
        ))}
      </div>
      <div className="live-actions">
        {s.running ? (
          <button className="live-btn" type="button" onClick={s.pause} data-testid="timer-pause">
            <Pause size={28} /> {t('stopwatch.pause')}
          </button>
        ) : (
          <button className="live-btn live-btn-go" type="button" onClick={s.start} data-testid="timer-start">
            <Play size={28} /> {left < s.totalS * 1000 ? t('stopwatch.resume') : t('stopwatch.start')}
          </button>
        )}
        <button className="live-btn" type="button" onClick={s.reset} data-testid="timer-reset">
          <RotateCcw size={24} /> {t('stopwatch.reset')}
        </button>
      </div>
    </section>
  );
}

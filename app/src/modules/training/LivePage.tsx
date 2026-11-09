import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useSettings } from '@/core/settings/settings';
import { FinishDialog, PocketButton } from '@/modules/tracks/Recording';
import { elapsedS, useRecorder } from '@/modules/tracks/recorder';
import { ACTIVITIES } from './activities';
import { calories } from './energy';
import { useBodyWeight, useTrainingFormat } from './format';
import { beep, buzz, say } from './cues';
import { phaseAt } from './intervals';
import { currentSpeedMs, kmAnnouncement, kmhFromMs, paceFromMs } from './live';
import { analyzeRecording, formatClock } from './stats';

/**
 * Pantalla en vivo de una sesión: el tiempo en grande y los datos de ahora
 * (ritmo o velocidad, distancia, desnivel, calorías), con botones grandes para
 * pausar y terminar. Para mirar de reojo corriendo o pedaleando.
 */
export function LivePage() {
  const { t, i18n } = useTranslation();
  const f = useTrainingFormat();
  const weight = useBodyWeight();
  const { status, track, elapsedMs, since, pause, resume } = useRecorder();
  const voice = useSettings((s) => s.settings.trainingVoice);
  const update = useSettings((s) => s.update);
  const [, tick] = useState(0);
  const [naming, setNaming] = useState(false);
  useWakeLock(status === 'recording');
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const segments = track?.segments;
  // Las estadísticas se recalculan cuando llega un punto, no cada segundo.
  const stats = useMemo(() => (segments ? analyzeRecording(segments.map((s) => (s.length > 1 ? s : []))) : null), [segments]);
  const nowMs = segments ? currentSpeedMs(segments) : 0;
  const elapsed = elapsedS({ elapsedMs, since });
  const kind = track?.activity;
  const def = kind ? ACTIVITIES[kind] : null;

  // Voz: al cerrar cada kilómetro lee el tiempo y el ritmo de ese kilómetro.
  const spokenKm = useRef(0);
  const km = stats?.splitsS.length ?? 0;
  useEffect(() => {
    if (km < spokenKm.current) spokenKm.current = km;
    if (!voice || km === spokenKm.current || km === 0 || !('speechSynthesis' in window)) {
      spokenKm.current = km;
      return;
    }
    spokenKm.current = km;
    const text = kmAnnouncement(km, elapsed, stats!.splitsS.at(-1), t, formatClock, (s) => f.pace(s).replace('/km', '').replace('/mi', '').trim());
    const u = new SpeechSynthesisUtterance(text);
    u.lang = i18n.language;
    window.speechSynthesis.speak(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [km, voice]);

  // Intervalos: en qué etapa se está y un aviso (pitido, vibración y voz) al cambiar y en los últimos 3 segundos.
  const plan = track?.intervals ?? null;
  const now = plan ? phaseAt(plan, elapsed) : null;
  const phaseIndex = now?.index ?? -1;
  const lastPhase = useRef(-1);
  const lastCount = useRef(-1);
  useEffect(() => {
    if (!plan || status !== 'recording') return;
    if (phaseIndex !== lastPhase.current) {
      const first = lastPhase.current === -1;
      lastPhase.current = phaseIndex;
      if (first && phaseIndex === 0) {
        // Al empezar no hace falta el aviso del primer cambio: ya se ve en pantalla.
        return;
      }
      beep(now?.done ? 523 : now?.phase?.kind === 'work' ? 988 : 660, 300);
      buzz(now?.done ? [200, 100, 200] : 300);
      if (voice) say(now?.done ? t('intervals.voice.done') : t(`intervals.voice.${now!.phase!.kind}`), i18n.language);
    }
  }, [phaseIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!now || now.done || status !== 'recording') return;
    if (now.remainingS <= 3 && now.remainingS >= 1 && lastCount.current !== now.index * 10 + now.remainingS) {
      lastCount.current = now.index * 10 + now.remainingS;
      beep(440, 80);
    }
  }); // cada segundo

  if (status === 'idle' || !track || !kind || !def || !stats) {
    return (
      <p className="empty">
        {t('training.live.none')} <Link to="/training/workouts">{t('common.back')}</Link>
      </p>
    );
  }

  const kcal = weight ? calories({ kind, weightKg: weight, packKg: track.activityPackKg ?? undefined, movingS: stats.movingS || elapsed, distanceM: stats.distanceM, ascentM: stats.ascentM }) : null;
  const effortNow = nowMs > 0 ? (def.measure === 'pace' ? f.pace(paceFromMs(nowMs)) : f.speed(kmhFromMs(nowMs))) : '—';
  const effortAvg = def.measure === 'pace' ? f.pace(stats.paceSPerKm) : f.speed(stats.avgSpeedKmh);
  const [distNum, ...distUnit] = f.distance(stats.distanceM).split(' ');

  return (
    <div className="live stack" data-testid="live">
      <p className="live-kind">
        {f.kindName(kind)} · {status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')}
      </p>
      {plan && now && (
        <div className={`live-phase live-phase-${now.done ? 'done' : now.phase!.kind}`} data-testid="live-phase" aria-live="polite">
          <span className="live-phase-name">
            {now.done ? t('intervals.voice.done') : t(`intervals.phase.${now.phase!.kind}`)}
            {!now.done && now.phase!.round ? ` ${now.phase!.round}/${plan.repeats}` : ''}
          </span>
          {!now.done && <span className="live-phase-time" data-testid="live-phase-time">{formatClock(now.remainingS)}</span>}
        </div>
      )}
      <p className="live-clock" data-testid="live-clock" data-paused={status === 'paused'}>
        {formatClock(elapsed)}
      </p>
      <div className="live-main">
        <span className="live-big" data-testid="live-distance">
          {distNum}
        </span>
        <span className="live-unit">{distUnit.join(' ')}</span>
      </div>
      <div className="live-grid">
        <div className="live-tile">
          <span className="live-label">{t(def.measure === 'pace' ? 'training.live.paceNow' : 'training.live.speedNow')}</span>
          <span className="live-value" data-testid="live-now">{effortNow}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t(def.measure === 'pace' ? 'training.live.paceAvg' : 'training.live.speedAvg')}</span>
          <span className="live-value">{effortAvg}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('training.live.ascent')}</span>
          <span className="live-value">{f.altitude(stats.ascentM)}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('training.live.calories')}</span>
          <span className="live-value">{kcal === null ? '—' : f.kcal(kcal)}</span>
        </div>
      </div>
      {!weight && (
        <p className="hint" style={{ margin: 0 }}>
          {t('training.noWeight')} <Link to="/first-aid/medical">{t('training.noWeightLink')}</Link>
        </p>
      )}
      <div className="live-actions">
        {status === 'recording' ? (
          <button className="live-btn" type="button" onClick={() => void pause()} data-testid="live-pause">
            <Pause size={28} /> {t('tracks.rec.pause')}
          </button>
        ) : (
          <button className="live-btn live-btn-go" type="button" onClick={resume} data-testid="live-resume">
            <Play size={28} /> {t('tracks.rec.resume')}
          </button>
        )}
        <button className="live-btn live-btn-stop" type="button" onClick={() => setNaming(true)} data-testid="live-finish">
          <Square size={24} fill="currentColor" /> {t('tracks.rec.finish')}
        </button>
      </div>
      <div className="row wrap">
        <button className="btn" type="button" aria-pressed={voice} onClick={() => void update({ trainingVoice: !voice })} data-testid="live-voice">
          {voice ? <Volume2 size={18} /> : <VolumeX size={18} />} {t(voice ? 'training.live.voiceOn' : 'training.live.voiceOff')}
        </button>
        <PocketButton />
      </div>
      {naming && <FinishDialog initialName={track.name} points={track.segments.flat().length} onClose={() => setNaming(false)} />}
    </div>
  );
}

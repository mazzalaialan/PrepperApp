import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Pause, Play, Plus } from 'lucide-react';
import { useWakeLock } from '@/core/power/useWakeLock';
import { Segmented } from '@/ui/Segmented';
import { beep, say } from './cues';
import { BREATH_PATTERNS, breathing, breathPhaseAt, PATTERN_FOR_EFFORT, patternById, type BreathPattern, type Effort } from './tools';

const EFFORTS: Effort[] = ['easy', 'moderate', 'hard', 'max'];

/**
 * Metrónomo de cadencia (un pitido por paso) y ritmo de respiración al correr.
 * Con la cadencia y el esfuerzo sugiere un patrón (3:2, 2:2, 2:1 o 1:1: pasos
 * inhalando y pasos exhalando) y cuántas respiraciones por minuto son. Con
 * sonido: un tono agudo al empezar a inhalar y uno grave al empezar a exhalar.
 */
export function MetronomePage() {
  const { t, i18n } = useTranslation();
  const [bpm, setBpm] = useState(170);
  const [on, setOn] = useState(false);
  const [effort, setEffort] = useState<Effort>('easy');
  const [patternId, setPatternId] = useState<BreathPattern['id']>(PATTERN_FOR_EFFORT.easy);
  const [steps, setSteps] = useState(true);
  const [breathSound, setBreathSound] = useState(true);
  const [voice, setVoice] = useState(false);
  const [phase, setPhase] = useState<'inhale' | 'exhale' | null>(null);
  const pattern = patternById(patternId);
  const info = breathing(bpm, pattern);
  // Lo que usa el ciclo de sonido, sin reiniciarlo al tocar los controles.
  const live = useRef({ bpm, pattern, steps, breathSound, voice, lang: i18n.language, inhale: '', exhale: '' });
  live.current = { bpm, pattern, steps, breathSound, voice, lang: i18n.language, inhale: t('metronome.inhale'), exhale: t('metronome.exhale') };
  useWakeLock(on);

  useEffect(() => {
    if (!on) {
      setPhase(null);
      return;
    }
    let step = 0;
    let next = performance.now();
    let id: ReturnType<typeof setTimeout>;
    const loop = () => {
      const c = live.current;
      const { phase: p, first } = breathPhaseAt(step, c.pattern);
      setPhase(p);
      if (c.steps) beep(1000, 40);
      if (c.breathSound && first) {
        // Agudo al empezar a inhalar, grave al empezar a exhalar.
        setTimeout(() => beep(p === 'inhale' ? 1500 : 600, 110), c.steps ? 70 : 0);
        if (c.voice) say(p === 'inhale' ? c.inhale : c.exhale, c.lang);
      }
      step += 1;
      next += 60_000 / c.bpm;
      id = setTimeout(loop, Math.max(0, next - performance.now()));
    };
    loop();
    return () => clearTimeout(id);
  }, [on]);

  const clamp = (n: number) => Math.min(220, Math.max(60, n));
  function pickEffort(e: Effort) {
    setEffort(e);
    setPatternId(PATTERN_FOR_EFFORT[e]);
  }

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.metronome.title')}</h1>

      <section className="card stack" data-testid="tool-metronome">
        <h2 className="section-title" style={{ margin: 0 }}>{t('metronome.cadence')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('metronome.intro')}</p>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <button className="icon-btn" type="button" onClick={() => setBpm((b) => clamp(b - 1))} aria-label={t('metronome.slower')}>
            <Minus size={22} />
          </button>
          <p className="live-big" style={{ margin: 0 }} data-testid="metronome-bpm">{bpm}</p>
          <span className="live-unit">{t('metronome.unit')}</span>
          <button className="icon-btn" type="button" onClick={() => setBpm((b) => clamp(b + 1))} aria-label={t('metronome.faster')}>
            <Plus size={22} />
          </button>
        </div>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {[160, 170, 180, 190].map((n) => (
            <button key={n} className="btn" type="button" aria-pressed={bpm === n} onClick={() => setBpm(n)}>
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack" data-testid="breathing">
        <h2 className="section-title" style={{ margin: 0 }}>{t('metronome.breathing')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('metronome.breathingIntro')}</p>
        <Segmented<Effort> label={t('metronome.effort')} value={effort} options={EFFORTS.map((e) => ({ value: e, label: t(`metronome.efforts.${e}`) }))} onChange={pickEffort} />
        <div className="field">
          <label htmlFor="breath-pattern">{t('metronome.pattern')}</label>
          <select id="breath-pattern" className="select" value={patternId} onChange={(e) => setPatternId(e.target.value as BreathPattern['id'])}>
            {BREATH_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.inhale}:{p.exhale} — {t('metronome.patternLabel', { inhale: p.inhale, exhale: p.exhale })}
              </option>
            ))}
          </select>
        </div>
        <p className="measure-big" data-testid="breath-result">
          {t('metronome.breathsPerMin', { n: info.breathsPerMin })}
          <span className="hint"> · {t('metronome.stepsPerBreath', { n: info.stepsPerBreath })}</span>
        </p>
        <p className="live-clock" data-testid="breath-phase" aria-live="polite" style={{ minHeight: '1.2em' }}>
          {phase === 'inhale' ? t('metronome.inhale') : phase === 'exhale' ? t('metronome.exhale') : '—'}
        </p>
        <table className="bmi-table" data-testid="breath-table">
          <caption>{t('metronome.tableTitle', { bpm })}</caption>
          <tbody>
            {BREATH_PATTERNS.map((p) => (
              <tr key={p.id} aria-current={p.id === patternId ? 'true' : undefined}>
                <td>{p.inhale}:{p.exhale}</td>
                <td>{t('metronome.breathsPerMin', { n: breathing(bpm, p).breathsPerMin })}</td>
                <td>{t(`metronome.use.${p.id}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint" style={{ margin: 0 }}>{t('metronome.breathingNote')}</p>
      </section>

      <section className="card stack">
        <label className="check">
          <input type="checkbox" checked={steps} onChange={(e) => setSteps(e.target.checked)} data-testid="metronome-steps" /> {t('metronome.soundSteps')}
        </label>
        <label className="check">
          <input type="checkbox" checked={breathSound} onChange={(e) => setBreathSound(e.target.checked)} data-testid="metronome-breath" /> {t('metronome.soundBreath')}
        </label>
        <label className="check">
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> {t('metronome.soundVoice')}
        </label>
        <button className={`live-btn${on ? '' : ' live-btn-go'}`} type="button" onClick={() => setOn(!on)} data-testid="metronome-toggle">
          {on ? <Pause size={24} /> : <Play size={24} />} {on ? t('metronome.stop') : t('metronome.start')}
        </button>
      </section>
    </div>
  );
}

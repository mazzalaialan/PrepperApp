import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describePlan, parseClock, PRESETS, planDurationS, usesDistance, validPlan, type IntervalPlan } from './intervals';
import { formatClock } from './stats';

/** Elige un plan de intervalos (uno armado o uno a medida) para la sesión; "sin intervalos" por defecto. */
export function IntervalPicker({ onChange }: { onChange: (plan: IntervalPlan | null) => void }) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState('none');
  const [custom, setCustom] = useState({ warmup: '5:00', work: '1:00', rest: '1:00', repeats: '8', cooldown: '5:00' });
  // El trabajo y el descanso se pueden medir en tiempo ("1:30") o en metros ("400").
  const [workBy, setWorkBy] = useState<'time' | 'dist'>('time');
  const [restBy, setRestBy] = useState<'time' | 'dist'>('time');
  const set = (k: keyof typeof custom, v: string) => setCustom((c) => ({ ...c, [k]: v }));

  const plan: IntervalPlan | null = (() => {
    if (choice === 'none') return null;
    if (choice !== 'custom') return PRESETS.find((p) => p.id === choice)?.plan ?? null;
    const metres = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0);
    const p: IntervalPlan = {
      warmupS: parseClock(custom.warmup) ?? 0,
      workS: workBy === 'time' ? (parseClock(custom.work) ?? 0) : 0,
      workM: workBy === 'dist' ? metres(custom.work) : null,
      restS: restBy === 'time' ? (parseClock(custom.rest) ?? 0) : 0,
      restM: restBy === 'dist' ? metres(custom.rest) : null,
      repeats: Number(custom.repeats),
      cooldownS: parseClock(custom.cooldown) ?? 0,
    };
    return validPlan(p) ? p : null;
  })();
  useEffect(() => onChange(plan), [choice, custom, workBy, restBy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="field" data-testid="intervals-picker">
      <label htmlFor="train-intervals">{t('intervals.label')}</label>
      <select id="train-intervals" className="select" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="none">{t('intervals.none')}</option>
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {t(`intervals.preset.${p.id}`)} ({describePlan(p.plan, formatClock)})
          </option>
        ))}
        <option value="custom">{t('intervals.custom')}</option>
      </select>
      {choice === 'custom' && (
        <div className="stack">
          <div className="row wrap">
            {(['warmup', 'repeats', 'cooldown'] as const).map((k) => (
              <div className="field" key={k} style={{ flex: 1, minWidth: 90 }}>
                <label htmlFor={`iv-${k}`}>{t(`intervals.field.${k}`)}</label>
                <input id={`iv-${k}`} className="input" inputMode={k === 'repeats' ? 'numeric' : 'text'} value={custom[k]} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
          </div>
          {(['work', 'rest'] as const).map((k) => {
            const by = k === 'work' ? workBy : restBy;
            const setBy = k === 'work' ? setWorkBy : setRestBy;
            return (
              <div className="row wrap" key={k}>
                <div className="field" style={{ flex: 1, minWidth: 110 }}>
                  <label htmlFor={`iv-${k}-by`}>{t(`intervals.field.${k}By`)}</label>
                  <select id={`iv-${k}-by`} className="select" value={by} onChange={(e) => setBy(e.target.value as 'time' | 'dist')}>
                    <option value="time">{t('intervals.byTime')}</option>
                    <option value="dist">{t('intervals.byDistance')}</option>
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 110 }}>
                  <label htmlFor={`iv-${k}`}>{t(by === 'dist' ? 'intervals.meters' : `intervals.field.${k}`)}</label>
                  <input id={`iv-${k}`} className="input" inputMode={by === 'dist' ? 'numeric' : 'text'} value={custom[k]} onChange={(e) => set(k, e.target.value)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {choice === 'custom' && !plan && <p className="error" role="alert" style={{ margin: 0 }}>{t('intervals.invalid')}</p>}
      {plan && !usesDistance(plan) && <p className="hint" style={{ margin: 0 }}>{t('intervals.total', { time: formatClock(planDurationS(plan)) })}</p>}
      {plan && usesDistance(plan) && <p className="hint" style={{ margin: 0 }}>{t('intervals.needsGps')}</p>}
    </div>
  );
}

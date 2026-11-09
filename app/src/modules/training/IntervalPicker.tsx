import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describePlan, parseClock, PRESETS, planDurationS, validPlan, type IntervalPlan } from './intervals';
import { formatClock } from './stats';

/** Elige un plan de intervalos (uno armado o uno a medida) para la sesión; "sin intervalos" por defecto. */
export function IntervalPicker({ onChange }: { onChange: (plan: IntervalPlan | null) => void }) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState('none');
  const [custom, setCustom] = useState({ warmup: '5:00', work: '1:00', rest: '1:00', repeats: '8', cooldown: '5:00' });
  const set = (k: keyof typeof custom, v: string) => setCustom((c) => ({ ...c, [k]: v }));

  const plan: IntervalPlan | null = (() => {
    if (choice === 'none') return null;
    if (choice !== 'custom') return PRESETS.find((p) => p.id === choice)?.plan ?? null;
    const p: IntervalPlan = {
      warmupS: parseClock(custom.warmup) ?? 0,
      workS: parseClock(custom.work) ?? 0,
      restS: parseClock(custom.rest) ?? 0,
      repeats: Number(custom.repeats),
      cooldownS: parseClock(custom.cooldown) ?? 0,
    };
    return validPlan(p) ? p : null;
  })();
  useEffect(() => onChange(plan), [choice, custom]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="row wrap">
          {(['warmup', 'work', 'rest', 'repeats', 'cooldown'] as const).map((k) => (
            <div className="field" key={k} style={{ flex: 1, minWidth: 90 }}>
              <label htmlFor={`iv-${k}`}>{t(`intervals.field.${k}`)}</label>
              <input id={`iv-${k}`} className="input" inputMode={k === 'repeats' ? 'numeric' : 'text'} value={custom[k]} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      )}
      {choice === 'custom' && !plan && <p className="error" role="alert" style={{ margin: 0 }}>{t('intervals.invalid')}</p>}
      {plan && <p className="hint" style={{ margin: 0 }}>{t('intervals.total', { time: formatClock(planDurationS(plan)) })}</p>}
    </div>
  );
}

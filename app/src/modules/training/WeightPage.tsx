import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { WeightEntry } from '@/core/model/types';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { useTraining } from './store';
import { useSettings } from '@/core/settings/settings';
import { bmi, bmiCategory, localDay, parseKg, sortedWeights, summarize } from './weight';

/** Gráfico de línea del peso a lo largo del tiempo (SVG, sin librerías). */
function WeightChart({ list }: { list: WeightEntry[] }) {
  if (list.length < 2) return null;
  const W = 320;
  const H = 120;
  const pad = 8;
  const t0 = Date.parse(list[0]!.day);
  const t1 = Date.parse(list.at(-1)!.day);
  const kgs = list.map((e) => e.kg);
  const lo = Math.min(...kgs) - 0.5;
  const hi = Math.max(...kgs) + 0.5;
  const x = (day: string) => pad + (t1 === t0 ? 0 : ((Date.parse(day) - t0) / (t1 - t0)) * (W - 2 * pad));
  const y = (kg: number) => H - pad - ((kg - lo) / (hi - lo)) * (H - 2 * pad);
  const points = list.map((e) => `${x(e.day).toFixed(1)},${y(e.kg).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="" style={{ width: '100%', height: 'auto' }} data-testid="weight-chart">
      <polyline points={points} fill="none" stroke="var(--accent, currentColor)" strokeWidth="2" strokeLinejoin="round" />
      {list.map((e) => (
        <circle key={e.id} cx={x(e.day)} cy={y(e.kg)} r="3" fill="var(--accent, currentColor)" />
      ))}
    </svg>
  );
}

/**
 * Peso: se carga acá, queda en un historial con su gráfico y se actualiza
 * también en la ficha médica propia (la que usa el Entrenamiento para las
 * calorías). Sin ficha propia no falla: el historial se guarda igual y avisa.
 */
export function WeightPage() {
  const { t, i18n } = useTranslation();
  const weights = useTraining((s) => s.weights);
  const saveWeight = useTraining((s) => s.saveWeight);
  const deleteWeight = useTraining((s) => s.deleteWeight);
  const profiles = useMedical((s) => s.profiles);
  const saveProfile = useMedical((s) => s.saveProfile);
  const me = [...profiles.values()].find((p) => p.isMe);
  const settingsHeight = useSettings((s) => s.settings.heightCm);
  const updateSettings = useSettings((s) => s.update);
  const heightCm = me?.heightCm ?? settingsHeight;
  const [heightText, setHeightText] = useState('');
  const [kgText, setKgText] = useState('');
  const [day, setDay] = useState(localDay());
  const [error, setError] = useState(false);
  const list = sortedWeights(weights.values());
  const sum = summarize(list);
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${nf.format(n)} kg`);
  const latest = list.at(-1);
  const kgNow = sum.current ?? me?.weightKg ?? null;
  const imc = bmi(kgNow, heightCm);
  // La categoría de la OMS es para adultos: con menos de 18 años solo se muestra el número.
  const adult = !me?.birthDate || Date.now() - Date.parse(me.birthDate) >= 18 * 365.25 * 86_400_000;

  async function saveHeight() {
    const cm = Number(heightText.replace(',', '.'));
    if (!Number.isFinite(cm) || cm < 50 || cm > 250) return;
    if (me) await saveProfile({ ...me, heightCm: Math.round(cm) });
    else await updateSettings({ heightCm: Math.round(cm) });
    setHeightText('');
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const kg = parseKg(kgText);
    if (kg === null || !day) {
      setError(true);
      return;
    }
    setError(false);
    await saveWeight(newEntity<WeightEntry>({ day, kg }));
    setKgText('');
    // La ficha médica toma el peso más reciente (no el de un registro viejo cargado después).
    const newest = sortedWeights([...weights.values(), { day } as WeightEntry]).at(-1)!.day === day && (!latest || day >= latest.day);
    if (me && newest) await saveProfile({ ...me, weightKg: kg });
  }

  return (
    <div className="stack">
      <h1 className="page-title">{t('weight.title')}</h1>
      <section className="card stack">
        <dl className="track-stats" data-testid="weight-summary">
          <div>
            <dt>{t('weight.current')}</dt>
            <dd data-testid="weight-current">{sum.current === null ? (me?.weightKg ? `${nf.format(me.weightKg)} kg` : '—') : `${nf.format(sum.current)} kg`}</dd>
          </div>
          <div>
            <dt>{t('weight.last30')}</dt>
            <dd>{signed(sum.last30)}</dd>
          </div>
          <div>
            <dt>{t('weight.sinceStart')}</dt>
            <dd>{signed(sum.sinceStart)}</dd>
          </div>
        </dl>
        <div className="stack" style={{ gap: 6 }} data-testid="weight-bmi">
          <strong>
            {t('weight.bmi')}: {imc === null ? '—' : nf.format(imc)}
            {imc !== null && adult && ` · ${t(`weight.bmiCategory.${bmiCategory(imc)}`)}`}
          </strong>
          {imc === null && <p className="hint" style={{ margin: 0 }}>{t('weight.bmiNeedsHeight')}</p>}
          <div className="row wrap">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="weight-height">{t('weight.height')}{heightCm ? ` (${heightCm} cm)` : ''}</label>
              <input id="weight-height" className="input" inputMode="decimal" value={heightText} placeholder={heightCm ? String(heightCm) : 'cm'} onChange={(e) => setHeightText(e.target.value)} />
            </div>
            <button className="btn" type="button" data-testid="weight-height-save" onClick={() => void saveHeight()}>{t('common.save')}</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>{t('weight.bmiNote')}</p>
        </div>
        <table className="bmi-table" data-testid="bmi-table">
          <caption>{t('weight.bmiTable.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('weight.bmiTable.range')}</th>
              <th scope="col">{t('weight.bmiTable.category')}</th>
            </tr>
          </thead>
          <tbody>
            {([['low', '< 18,5'], ['normal', '18,5 – 24,9'], ['overweight', '25 – 29,9'], ['obese', '≥ 30']] as const).map(([k, range]) => (
              <tr key={k} aria-current={imc !== null && adult && bmiCategory(imc) === k ? 'true' : undefined}>
                <td>{range}</td>
                <td>{t(`weight.bmiCategory.${k}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <WeightChart list={list} />
        {!me && (
          <p className="hint" style={{ margin: 0 }} data-testid="weight-no-profile">
            {t('weight.noProfile')} <Link to="/first-aid/medical">{t('weight.noProfileLink')}</Link>
          </p>
        )}
        {me && !me.weightKg && list.length === 0 && <p className="hint" style={{ margin: 0 }}>{t('weight.profileEmpty')}</p>}
      </section>
      <form className="card stack" onSubmit={(e) => void add(e)}>
        <h2 className="section-title" style={{ margin: 0 }}>{t('weight.add')}</h2>
        <div className="row wrap">
          <div className="field">
            <label htmlFor="weight-kg">{t('weight.kg')}</label>
            <input id="weight-kg" className="input" inputMode="decimal" value={kgText} onChange={(e) => setKgText(e.target.value)} aria-invalid={error} />
          </div>
          <div className="field">
            <label htmlFor="weight-day">{t('weight.day')}</label>
            <input id="weight-day" className="input" type="date" value={day} max={localDay()} onChange={(e) => setDay(e.target.value)} />
          </div>
        </div>
        {error && <p className="error" role="alert">{t('weight.invalid')}</p>}
        <div className="row-end">
          <button className="btn btn-primary" type="submit" data-testid="weight-save">{t('common.save')}</button>
        </div>
        <p className="hint" style={{ margin: 0 }}>{me ? t('weight.syncs') : t('weight.onlyHistory')}</p>
      </form>
      {list.length > 0 && (
        <section className="card stack">
          <ul className="list" data-testid="weight-list">
            {[...list].reverse().map((e) => (
              <li key={e.id} className="contact-row">
                <span className="list-main">
                  <span className="list-title">{nf.format(e.kg)} kg</span>
                  <span className="list-sub">{new Date(`${e.day}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </span>
                <button className="icon-btn" type="button" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => window.confirm(t('weight.confirmDelete')) && void deleteWeight(e.id)}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { WorkoutKind } from '@/core/model/types';
import { ACTIVITIES, GROUPS, isActivityKind, kindsOf } from './activities';
import { calories } from './energy';
import { useBodyWeight } from './format';
import { blankWorkout, useTraining } from './store';
import { formatPace } from './stats';

const num = (s: string) => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** "1:05:30", "45:10" o "90" (minutos) → segundos. */
export function parseDuration(s: string): number | null {
  const parts = s.trim().split(':').map((p) => Number(p));
  if (!s.trim() || parts.some((p) => !Number.isFinite(p) || p < 0) || parts.length > 3) return null;
  if (parts.length === 1) return Math.round(parts[0]! * 60);
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Cargar una sesión a mano: las de bajo techo (cinta, elíptica, escalador) y las que no se grabaron. */
export function WorkoutEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const save = useTraining((s) => s.saveWorkout);
  const myWeight = useBodyWeight();
  const first = params.get('kind');
  const [kind, setKind] = useState<WorkoutKind>(isActivityKind(first) ? first : 'treadmill');
  const def = ACTIVITIES[kind];
  const [name, setName] = useState('');
  const [when, setWhen] = useState(localInput(new Date()));
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [ascent, setAscent] = useState('');
  const [incline, setIncline] = useState('');
  const [intensity, setIntensity] = useState<'light' | 'moderate' | 'vigorous'>('moderate');
  const [weight, setWeight] = useState(myWeight ? String(myWeight) : '');
  const [pack, setPack] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const seconds = parseDuration(duration);
  const km = num(distance);
  const kg = num(weight);
  const preview =
    seconds && kg && (def.group !== 'indoor' || kind === 'treadmill' ? km !== null : true)
      ? calories({ kind, weightKg: kg, packKg: num(pack) ?? undefined, movingS: seconds, distanceM: (km ?? 0) * 1000, ascentM: num(ascent) ?? 0, inclinePct: num(incline) ?? undefined, intensity })
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!seconds || seconds <= 0) return setError(t('training.errDuration'));
    if ((def.group !== 'indoor' || kind === 'treadmill') && km === null) return setError(t('training.errDistance'));
    const distanceM = Math.round((km ?? 0) * 1000);
    const hours = seconds / 3600;
    const base = blankWorkout(kind, name.trim() || t(`training.kind.${kind}`), new Date(when).toISOString());
    const saved = await save({
      ...base,
      totalS: seconds,
      movingS: seconds,
      distanceM,
      ascentM: Math.round(num(ascent) ?? 0),
      avgSpeedKmh: distanceM > 0 ? distanceM / 1000 / hours : 0,
      paceSPerKm: distanceM > 0 ? seconds / (distanceM / 1000) : 0,
      calories: kg ? calories({ kind, weightKg: kg, packKg: num(pack) ?? undefined, movingS: seconds, distanceM, ascentM: num(ascent) ?? 0, inclinePct: num(incline) ?? undefined, intensity }) : 0,
      weightKg: kg,
      packKg: kind === 'trek' ? num(pack) : null,
      inclinePct: kind === 'treadmill' ? num(incline) : null,
      intensity: kind === 'elliptical' || kind === 'stairClimber' ? intensity : null,
      notes,
    });
    navigate(`/training/workouts/${saved.id}`, { replace: true });
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <h1 className="page-title">{t('training.manualTitle')}</h1>
      <section className="card stack">
        <div className="field">
          <label htmlFor="m-kind">{t('training.activity')}</label>
          <select id="m-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as WorkoutKind)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={t(`training.group.${g}`)}>
                {kindsOf(g).map((k) => (
                  <option key={k} value={k}>
                    {t(`training.kind.${k}`)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-name">{t('training.name')}</label>
          <input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t(`training.kind.${kind}`)} />
        </div>
        <div className="field">
          <label htmlFor="m-when">{t('training.when')}</label>
          <input id="m-when" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="m-duration">{t('training.duration')}</label>
            <input id="m-duration" className="input" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45:00" />
            <p className="hint" style={{ margin: 0 }}>{t('training.durationHint')}</p>
          </div>
          {(def.group !== 'indoor' || kind === 'treadmill') && (
            <div className="field">
              <label htmlFor="m-distance">{t('training.distanceKm')}</label>
              <input id="m-distance" className="input" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="5" />
            </div>
          )}
        </div>
        {def.group !== 'indoor' && (
          <div className="field">
            <label htmlFor="m-ascent">{t('training.ascentM')}</label>
            <input id="m-ascent" className="input" inputMode="numeric" value={ascent} onChange={(e) => setAscent(e.target.value)} placeholder="0" />
          </div>
        )}
        {kind === 'treadmill' && (
          <div className="field">
            <label htmlFor="m-incline">{t('training.incline')}</label>
            <input id="m-incline" className="input" inputMode="decimal" value={incline} onChange={(e) => setIncline(e.target.value)} placeholder="0" />
          </div>
        )}
        {(kind === 'elliptical' || kind === 'stairClimber') && (
          <div className="field">
            <label htmlFor="m-intensity">{t('training.intensity.label')}</label>
            <select id="m-intensity" className="select" value={intensity} onChange={(e) => setIntensity(e.target.value as typeof intensity)}>
              {(['light', 'moderate', 'vigorous'] as const).map((i) => (
                <option key={i} value={i}>
                  {t(`training.intensity.${i}`)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="m-weight">{t('medical.weightKg')}</label>
            <input id="m-weight" className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          {kind === 'trek' && (
            <div className="field">
              <label htmlFor="m-pack">{t('training.pack')}</label>
              <input id="m-pack" className="input" inputMode="decimal" value={pack} onChange={(e) => setPack(e.target.value)} />
            </div>
          )}
        </div>
        {seconds && km && km > 0 && (
          <p className="hint" style={{ margin: 0 }} data-testid="m-preview">
            {def.measure === 'pace' ? `${formatPace(seconds / km)} /km` : `${(km / (seconds / 3600)).toFixed(1)} km/h`}
            {preview !== null && ` · ${preview} kcal`}
          </p>
        )}
        {preview !== null && !(seconds && km && km > 0) && (
          <p className="hint" style={{ margin: 0 }} data-testid="m-preview">
            {preview} kcal
          </p>
        )}
        <div className="field">
          <label htmlFor="m-notes">{t('training.notes')}</label>
          <textarea id="m-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row-end">
          <button className="btn btn-primary" type="submit">
            <Check size={18} /> {t('common.save')}
          </button>
        </div>
      </section>
    </form>
  );
}

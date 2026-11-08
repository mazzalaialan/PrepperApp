import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Map as MapIcon, Pencil, Trash2 } from 'lucide-react';
import { ElevationProfile } from '@/modules/tracks/ElevationProfile';
import { useTracks } from '@/modules/tracks/store';
import { ACTIVITIES } from './activities';
import { useBodyWeight, useTrainingFormat } from './format';
import { recalculated } from './history';
import { blankOuting } from './outings';
import { useTraining } from './store';

/** Una sesión: sus datos, parciales por kilómetro, mapa, perfil de altura, salida y borrado. */
export function WorkoutPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const workout = useTraining((s) => (id ? s.workouts.get(id) : undefined));
  const loaded = useTraining((s) => s.loaded);
  if (!workout) {
    return (
      <p className="empty">
        {loaded ? t('training.notFound') : t('training.loading')} <Link to="/training/workouts">{t('common.back')}</Link>
      </p>
    );
  }
  return <WorkoutDetail key={workout.id} id={workout.id} />;
}

function WorkoutDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const navigate = useNavigate();
  const w = useTraining((s) => s.workouts.get(id))!;
  const outings = useTraining((s) => s.outings);
  const save = useTraining((s) => s.saveWorkout);
  const saveOuting = useTraining((s) => s.saveOuting);
  const remove = useTraining((s) => s.deleteWorkout);
  const track = useTracks((s) => (w.trackId ? s.tracks.get(w.trackId) : undefined));
  const myWeight = useBodyWeight();
  const [name, setName] = useState<string | null>(null);
  const [weight, setWeight] = useState(String(w.weightKg ?? ''));
  const [pack, setPack] = useState(String(w.packKg ?? ''));
  const def = ACTIVITIES[w.kind];
  const hasGps = w.source === 'gps' && !!track;

  const commitName = () => {
    if (name !== null && name.trim() && name.trim() !== w.name) void save({ ...w, name: name.trim() });
    setName(null);
  };
  const recalc = () => void save(recalculated(w, Number(weight) > 0 ? Number(weight) : null, Number(pack) > 0 ? Number(pack) : null));
  async function chooseOuting(value: string) {
    if (value === '__new') {
      const created = await saveOuting(blankOuting(t('outings.newName')));
      await save({ ...w, outingId: created.id });
      navigate(`/training/outings/${created.id}`);
      return;
    }
    await save({ ...w, outingId: value || null });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>
          {name === null ? w.name : <input className="input" aria-label={t('training.name')} value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} autoFocus />}
        </h1>
        {name === null && (
          <button className="icon-btn" type="button" onClick={() => setName(w.name)} aria-label={t('training.rename')} title={t('training.rename')}>
            <Pencil size={18} />
          </button>
        )}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {f.kindName(w.kind)} · {f.dateTime(w.startedAt)}
        {w.source === 'manual' && ` · ${t('training.manualEntry')}`}
      </p>

      <section className="card stack" aria-label={t('training.data')}>
        <dl className="track-stats" data-testid="workout-stats">
          <div>
            <dt>{t('training.time')}</dt>
            <dd data-testid="w-time">{f.clock(w.totalS)}</dd>
          </div>
          {w.movingS > 0 && w.movingS !== w.totalS && (
            <div>
              <dt>{t('training.moving')}</dt>
              <dd>{f.clock(w.movingS)}</dd>
            </div>
          )}
          <div>
            <dt>{t('training.distance')}</dt>
            <dd data-testid="w-distance">{f.distance(w.distanceM)}</dd>
          </div>
          <div>
            <dt>{def.measure === 'pace' ? t('training.pace') : t('training.speed')}</dt>
            <dd data-testid="w-effort">{f.effort(w.kind, w)}</dd>
          </div>
          <div>
            <dt>{t('training.calories')}</dt>
            <dd data-testid="w-kcal">{w.calories > 0 ? f.kcal(w.calories) : '—'}</dd>
          </div>
          {(def.gps || w.ascentM > 0) && (
            <>
              <div>
                <dt>{t('training.ascent')}</dt>
                <dd data-testid="w-ascent">{f.altitude(w.ascentM)}</dd>
              </div>
              <div>
                <dt>{t('training.descent')}</dt>
                <dd>{f.altitude(w.descentM)}</dd>
              </div>
            </>
          )}
          {w.maxEle !== null && (
            <div>
              <dt>{t('training.maxEle')}</dt>
              <dd>{f.altitude(w.maxEle)}</dd>
            </div>
          )}
          {w.minEle !== null && (
            <div>
              <dt>{t('training.minEle')}</dt>
              <dd>{f.altitude(w.minEle)}</dd>
            </div>
          )}
          {w.maxSpeedKmh > 0 && (
            <div>
              <dt>{t('training.maxSpeed')}</dt>
              <dd>{f.speed(w.maxSpeedKmh)}</dd>
            </div>
          )}
          {w.avgHr !== null && (
            <div>
              <dt>{t('training.avgHr')}</dt>
              <dd>{w.avgHr} {t('training.bpm')}</dd>
            </div>
          )}
          {w.maxHr !== null && (
            <div>
              <dt>{t('training.maxHr')}</dt>
              <dd>{w.maxHr} {t('training.bpm')}</dd>
            </div>
          )}
        </dl>
        {track && <ElevationProfile track={track} />}
        {hasGps && (
          <div className="row-end wrap">
            <Link className="btn" to={`/orientation/maps?track=${w.trackId}`} data-testid="w-map">
              <MapIcon size={18} /> {t('training.onMap')}
            </Link>
          </div>
        )}
      </section>

      {w.splitsS.length > 0 && (
        <section className="card stack" aria-labelledby="w-splits">
          <h2 id="w-splits" className="section-title" style={{ margin: 0 }}>
            {t('training.splits')}
          </h2>
          <ol className="splits" data-testid="w-splits">
            {w.splitsS.map((s, i) => (
              <li key={i}>
                <span>{t('training.kmN', { n: i + 1 })}</span>
                <strong>{f.clock(s)}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card stack" aria-labelledby="w-calc">
        <h2 id="w-calc" className="section-title" style={{ margin: 0 }}>
          {t('training.calcTitle')}
        </h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="w-weight">{t('medical.weightKg')}</label>
            <input id="w-weight" className="input" type="number" inputMode="decimal" min={20} max={400} step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={myWeight ? String(myWeight) : ''} />
          </div>
          {w.kind === 'trek' && (
            <div className="field">
              <label htmlFor="w-pack">{t('training.pack')}</label>
              <input id="w-pack" className="input" type="number" inputMode="decimal" min={0} max={80} step={0.5} value={pack} onChange={(e) => setPack(e.target.value)} />
            </div>
          )}
        </div>
        <div className="row-end">
          <button className="btn" type="button" onClick={recalc}>
            {t('training.recalculate')}
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>{t('training.estimate')}</p>
      </section>

      <section className="card stack" aria-labelledby="w-outing">
        <h2 id="w-outing" className="section-title" style={{ margin: 0 }}>
          {t('training.outingTitle')}
        </h2>
        <div className="field">
          <label htmlFor="w-outing-sel">{t('training.outing')}</label>
          <select id="w-outing-sel" className="select" value={w.outingId ?? ''} onChange={(e) => void chooseOuting(e.target.value)}>
            <option value="">{t('training.noOuting')}</option>
            {[...outings.values()].sort((a, b) => a.name.localeCompare(b.name)).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="__new">{t('training.newOuting')}</option>
          </select>
        </div>
        {w.outingId && outings.get(w.outingId) && (
          <Link to={`/training/outings/${w.outingId}`}>{t('training.openOuting', { name: outings.get(w.outingId)!.name })}</Link>
        )}
      </section>

      <section className="card stack">
        <div className="field">
          <label htmlFor="w-notes">{t('training.notes')}</label>
          <textarea id="w-notes" className="input" rows={3} defaultValue={w.notes} onBlur={(e) => e.target.value !== w.notes && void save({ ...w, notes: e.target.value })} placeholder={t('training.notesHint')} />
        </div>
        <div className="row-end">
          <button
            className="btn btn-danger-outline"
            type="button"
            onClick={async () => {
              if (!window.confirm(t(hasGps ? 'training.confirmDeleteGps' : 'training.confirmDelete', { name: w.name }))) return;
              await remove(w.id);
              navigate('/training/workouts', { replace: true });
            }}
          >
            <Trash2 size={18} /> {t('common.delete')}
          </button>
        </div>
      </section>
    </div>
  );
}

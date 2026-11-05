import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Navigation, Plus, Trash2, X } from 'lucide-react';
import { distanceMeters } from '@/core/geo/geo';
import { newEntity } from '@/core/model/entity';
import type { Id, Route } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { routeLength, useWaypoints } from './store';

export function RouteEditPage() {
  const { id } = useParams();
  const stored = useWaypoints((s) => (id ? s.routes.get(id) : undefined));
  const loaded = useWaypoints((s) => s.loaded);
  const { t } = useTranslation();
  if (!loaded) return null;
  if (id !== 'new' && !stored) {
    return (
      <p className="empty">
        {t('routes.notFound')} <Link to="/orientation/waypoints">{t('common.back')}</Link>
      </p>
    );
  }
  return <RouteForm key={stored?.id ?? 'new'} stored={stored} />;
}

function RouteForm({ stored }: { stored: Route | undefined }) {
  const [initial] = useState(() => stored ?? newEntity<Route>({ name: '', waypointIds: [], notes: '' }));
  const isNew = !stored;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const { waypoints, saveRoute, deleteRoute } = useWaypoints();
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [ids, setIds] = useState<Id[]>(initial.waypointIds.filter((w) => waypoints.has(w)));
  const [toAdd, setToAdd] = useState('');
  const [saved, setSaved] = useState(false);

  const points = ids.map((w) => waypoints.get(w)!);
  const options = [...waypoints.values()].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  const changeIds = (next: Id[]) => {
    setIds(next);
    setSaved(false);
  };
  const move = (index: number, delta: -1 | 1) => {
    const next = [...ids];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    changeIds(next);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveRoute({ ...initial, name: name.trim(), notes, waypointIds: ids });
    if (isNew) navigate(`/orientation/routes/${initial.id}`, { replace: true });
    else setSaved(true);
  }

  async function handleDelete() {
    if (!stored || !window.confirm(t('routes.confirmDelete', { name: stored.name }))) return;
    await deleteRoute(stored.id);
    navigate('/orientation/waypoints', { replace: true });
  }

  // Se recorre la ruta guardada: si los puntos cambiaron, primero hay que guardar.
  const canStart = stored !== undefined && ids.length > 0 && stored.waypointIds.join() === ids.join();

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('routes.new')}</h1>
      </div>

      {canStart && (
        <Link className="btn btn-primary btn-block" to={`/orientation/routes/${stored!.id}/go/1`}>
          <Navigation size={20} /> {t('routes.start')}
        </Link>
      )}

      <form className="stack" onSubmit={handleSubmit}>
        <section className="card stack">
          <div className="field">
            <label htmlFor="route-name">{t('routes.name')}</label>
            <input id="route-name" className="input" required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} autoFocus={isNew} placeholder={t('routes.namePlaceholder')} />
          </div>
          <div className="field">
            <label htmlFor="route-notes">{t('waypoints.notes')}</label>
            <textarea id="route-notes" className="input textarea" value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} />
          </div>
        </section>

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('routes.points')}</h2>
          {points.length === 0 ? (
            <p className="hint">{t('routes.noPoints')}</p>
          ) : (
            <ol className="list route-points">
              {points.map((wp, i) => (
                <li key={`${wp.id}-${i}`} className="list-row">
                  <span className="route-index">{i + 1}</span>
                  <span className="list-main">
                    <span className="list-title">{wp.name}</span>
                    {i > 0 && <span className="list-sub">{t('routes.legFromPrevious', { distance: formatDistance(distanceMeters(points[i - 1]!, wp), units, i18n.language) })}</span>}
                  </span>
                  <button className="icon-btn" type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('documents.moveBefore')}>
                    <ArrowUp size={18} />
                  </button>
                  <button className="icon-btn" type="button" onClick={() => move(i, 1)} disabled={i === points.length - 1} aria-label={t('documents.moveAfter')}>
                    <ArrowDown size={18} />
                  </button>
                  <button className="icon-btn" type="button" onClick={() => changeIds(ids.filter((_, j) => j !== i))} aria-label={t('routes.removePoint', { name: wp.name })}>
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {points.length > 1 && <p className="lot-total">{t('routes.total', { distance: formatDistance(routeLength(points), units, i18n.language) })}</p>}
          {options.length === 0 ? (
            <p className="hint">
              {t('routes.needPoints')} <Link to="/orientation/waypoints">{t('modules.waypoints.title')}</Link>
            </p>
          ) : (
            <div className="input-group">
              <select className="select" value={toAdd} onChange={(e) => setToAdd(e.target.value)} aria-label={t('routes.choosePoint')}>
                <option value="">{t('routes.choosePoint')}</option>
                {options.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
              <button className="btn" type="button" disabled={!toAdd} onClick={() => { changeIds([...ids, toAdd]); setToAdd(''); }} aria-label={t('routes.addPoint')}>
                <Plus size={18} /> {t('routes.addPoint')}
              </button>
            </div>
          )}
        </section>

        {saved && <p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

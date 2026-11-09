import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { Gear, WorkoutKind } from '@/core/model/types';
import { useInventory } from '@/modules/inventory/store';
import { ACTIVITY_KINDS } from './activities';
import { wear } from './gear';
import { useTraining } from './store';

/**
 * Equipo: zapatillas, bici, bote… Suma los km de las actividades donde se usó
 * y avisa cuando llega a su vida útil. Se puede vincular a un artículo del
 * Inventario (ahí se ve cuánto lleva); todo esto se oculta desde Entrenamiento
 * si no se usa.
 */
export function GearPage() {
  const { t } = useTranslation();
  const gear = useTraining((s) => s.gear);
  const workouts = useTraining((s) => s.workouts);
  const saveGear = useTraining((s) => s.saveGear);
  const deleteGear = useTraining((s) => s.deleteGear);
  const items = useInventory((s) => s.items);
  const [name, setName] = useState('');
  const [kinds, setKinds] = useState<WorkoutKind[]>([]);
  const [startKm, setStartKm] = useState('');
  const [retireKm, setRetireKm] = useState('');
  const [itemId, setItemId] = useState('');
  const list = [...gear.values()].sort((a, b) => Number(a.retired ?? false) - Number(b.retired ?? false) || a.name.localeCompare(b.name));
  const num = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await saveGear(newEntity<Gear>({ name: name.trim(), kinds, startKm: num(startKm), retireKm: num(retireKm), inventoryItemId: itemId || null, retired: false }));
    setName('');
    setKinds([]);
    setStartKm('');
    setRetireKm('');
    setItemId('');
  }

  return (
    <div className="stack">
      <h1 className="page-title">{t('gear.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>{t('gear.intro')}</p>
      {list.length > 0 && (
        <section className="card stack">
          <ul className="list" data-testid="gear-list">
            {list.map((g) => {
              const w = wear(g, workouts.values());
              const item = g.inventoryItemId ? items.get(g.inventoryItemId) : undefined;
              return (
                <li key={g.id} className="contact-row" data-testid="gear-row">
                  <span className="list-main">
                    <span className="list-title">{g.name}{g.retired ? ` · ${t('gear.retired')}` : ''}</span>
                    <span className="list-sub">
                      {w.km} km{g.retireKm > 0 ? ` / ${g.retireKm} km` : ''}
                      {w.worn ? ` · ${t('gear.worn')}` : w.nearEnd ? ` · ${t('gear.nearEnd')}` : ''}
                      {item ? ` · ${t('gear.inInventory', { name: item.name })}` : ''}
                    </span>
                    {w.fraction !== null && (
                      <span className="progress">
                        <span className="progress-bar" data-done={!w.nearEnd} style={{ width: `${Math.round(w.fraction * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="contact-actions">
                    <button className="btn" type="button" onClick={() => void saveGear({ ...g, retired: !g.retired })}>
                      {g.retired ? t('gear.reactivate') : t('gear.retire')}
                    </button>
                    <button className="icon-btn" type="button" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => window.confirm(t('gear.confirmDelete', { name: g.name })) && void deleteGear(g.id)}>
                      <Trash2 size={18} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <form className="card stack" onSubmit={(e) => void add(e)}>
        <h2 className="section-title" style={{ margin: 0 }}>{t('gear.add')}</h2>
        <div className="field">
          <label htmlFor="gear-name">{t('gear.name')}</label>
          <input id="gear-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('gear.nameHint')} />
        </div>
        <div className="field">
          <label htmlFor="gear-kinds">{t('gear.kinds')}</label>
          <select
            id="gear-kinds"
            className="select"
            multiple
            size={5}
            value={kinds}
            onChange={(e) => setKinds([...e.target.selectedOptions].map((o) => o.value as WorkoutKind))}
          >
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`training.kind.${k}`)}
              </option>
            ))}
          </select>
          <p className="hint" style={{ margin: 0 }}>{t('gear.kindsHint')}</p>
        </div>
        <div className="row wrap">
          <div className="field">
            <label htmlFor="gear-start">{t('gear.startKm')}</label>
            <input id="gear-start" className="input" inputMode="decimal" value={startKm} onChange={(e) => setStartKm(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="gear-retire">{t('gear.retireKm')}</label>
            <input id="gear-retire" className="input" inputMode="decimal" value={retireKm} onChange={(e) => setRetireKm(e.target.value)} />
          </div>
        </div>
        {items.size > 0 && (
          <div className="field">
            <label htmlFor="gear-item">{t('gear.inventoryItem')}</label>
            <select id="gear-item" className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">—</option>
              {[...items.values()].sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="row-end">
          <button className="btn btn-primary" type="submit" data-testid="gear-save">
            <Plus size={18} /> {t('gear.save')}
          </button>
        </div>
      </form>
      <p><Link to="/training/workouts">{t('common.back')}</Link></p>
    </div>
  );
}

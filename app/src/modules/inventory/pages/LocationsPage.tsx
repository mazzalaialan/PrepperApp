import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import { MAX_LOCATION_DEPTH, type Id, type Location } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatWeight } from '@/core/units/units';
import { Dialog } from '@/ui/Dialog';
import { buildTree, canMoveTo, subtreeIds, type LocationNode } from '../domain/locations';
import { weightAt } from '../domain/stock';
import { useLocationOptions } from '../selectors';
import { InventoryError, useInventory } from '../store';

type Editing = { location: Location; isNew: boolean } | null;

export function LocationsPage() {
  const { t } = useTranslation();
  const locations = useInventory((s) => s.locations);
  const tree = useMemo(() => buildTree([...locations.values()]), [locations]);
  const [editing, setEditing] = useState<Editing>(null);

  const startNew = (parentId: Id | null) =>
    setEditing({ location: newEntity<Location>({ name: '', parentId, depth: 0, notes: '', waypointId: null }), isNew: true });

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.locations.title')}</h1>
        <button className="btn btn-primary" type="button" onClick={() => startNew(null)}>
          <Plus size={20} /> {t('locations.new')}
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>{t('locations.hint', { max: MAX_LOCATION_DEPTH })}</p>
      {tree.length === 0 ? (
        <p className="empty">{t('locations.empty')}</p>
      ) : (
        <ul className="tree">
          {tree.map((node) => (
            <TreeNode key={node.location.id} node={node} onEdit={(l) => setEditing({ location: l, isNew: false })} onAddChild={startNew} />
          ))}
        </ul>
      )}
      {editing && <LocationDialog location={editing.location} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function TreeNode({ node, onEdit, onAddChild }: { node: LocationNode; onEdit: (l: Location) => void; onAddChild: (parentId: Id) => void }) {
  const { t, i18n } = useTranslation();
  const { items, lots, locations } = useInventory(useShallow((s) => ({ items: s.items, lots: s.lots, locations: s.locations })));
  const units = useSettings((s) => s.settings.units);
  const [open, setOpen] = useState(true);
  const { location, children } = node;

  const { itemCount, grams } = useMemo(() => {
    const locList = [...locations.values()];
    const lotList = [...lots.values()];
    const scope = subtreeIds(location.id, locList);
    return {
      itemCount: new Set(lotList.filter((l) => scope.has(l.locationId)).map((l) => l.itemId)).size,
      grams: weightAt(location.id, lotList, items, locList),
    };
  }, [location.id, items, lots, locations]);

  return (
    <li>
      <div className="tree-row">
        <button
          className="icon-btn"
          type="button"
          onClick={() => setOpen(!open)}
          disabled={children.length === 0}
          aria-label={open ? t('locations.collapse') : t('locations.expand')}
          aria-expanded={open}
        >
          {children.length === 0 ? null : open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
        <span className="list-main">
          <span className="list-title">{location.name}</span>
          <span className="list-sub">
            {t('locations.summary', { count: itemCount })}
            {grams > 0 && ` · ${formatWeight(grams, units, i18n.language)}`}
          </span>
        </span>
        {location.depth < MAX_LOCATION_DEPTH && (
          <button className="icon-btn" type="button" onClick={() => onAddChild(location.id)} aria-label={t('locations.addChild')} title={t('locations.addChild')}>
            <Plus size={20} />
          </button>
        )}
        <button className="icon-btn" type="button" onClick={() => onEdit(location)} aria-label={t('common.edit')} title={t('common.edit')}>
          <Pencil size={18} />
        </button>
      </div>
      {open && children.length > 0 && (
        <ul className="tree">
          {children.map((child) => (
            <TreeNode key={child.location.id} node={child} onEdit={onEdit} onAddChild={onAddChild} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LocationDialog({ location, isNew, onClose }: { location: Location; isNew: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { saveLocation, deleteLocation, locations } = useInventory();
  const options = useLocationOptions();
  const [name, setName] = useState(location.name);
  const [parentId, setParentId] = useState(location.parentId ?? '');
  const [notes, setNotes] = useState(location.notes);
  const [error, setError] = useState<string | null>(null);

  // Una ubicación nueva puede colgar de cualquier nivel menor a 4; una existente, de donde no rompa el árbol.
  const all = [...locations.values()];
  const validParents = options.filter((o) =>
    isNew ? o.location.depth < MAX_LOCATION_DEPTH : canMoveTo(location.id, o.id, all),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveLocation({ ...location, name: name.trim(), parentId: parentId || null, notes });
    onClose();
  }

  async function handleDelete() {
    if (!window.confirm(t('locations.confirmDelete', { name: location.name }))) return;
    try {
      await deleteLocation(location.id);
      onClose();
    } catch (err) {
      if (err instanceof InventoryError && err.code === 'location-not-empty') setError(t('locations.notEmpty'));
      else throw err;
    }
  }

  return (
    <Dialog title={isNew ? t('locations.new') : t('locations.edit')} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="loc-name">{t('locations.name')}</label>
          <input id="loc-name" className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('locations.namePlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="loc-parent">{t('locations.parent')}</label>
          <select id="loc-parent" className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            {(isNew || canMoveTo(location.id, null, all)) && <option value="">{t('locations.root')}</option>}
            {validParents.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="loc-notes">{t('items.notes')}</label>
          <textarea id="loc-notes" className="input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
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
    </Dialog>
  );
}

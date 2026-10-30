import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { ControlType, Item, Lot } from '@/core/model/types';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { lotDueDate } from '../domain/alerts';
import { formatDay, useLocationOptions } from '../selectors';
import { useInventory } from '../store';

interface Props {
  item: Item;
  controlType: ControlType;
  lot: Lot | null;
  onClose: () => void;
}

const str = numToInput;

export function LotDialog({ item, controlType, lot, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { saveLot, deleteLot } = useInventory();
  const locationOptions = useLocationOptions();

  const [locationId, setLocationId] = useState(lot?.locationId ?? locationOptions[0]?.id ?? '');
  const [quantity, setQuantity] = useState(str(lot?.quantity ?? 1));
  const [expiryDate, setExpiryDate] = useState(lot?.expiryDate ?? '');
  const [manufactureDate, setManufactureDate] = useState(lot?.manufactureDate ?? '');
  const [shelfLifeYears, setShelfLifeYears] = useState(lot?.shelfLifeMonths ? str(+(lot.shelfLifeMonths / 12).toFixed(2)) : '');
  const [capacityTotal, setCapacityTotal] = useState(str(lot?.capacityTotal ?? null));
  const [capacityRemaining, setCapacityRemaining] = useState(str(lot?.capacityRemaining ?? null));
  const [capacityUnit, setCapacityUnit] = useState(lot?.capacityUnit ?? '');
  const [notes, setNotes] = useState(lot?.notes ?? '');

  const years = parseNum(shelfLifeYears);
  const fields = {
    locationId,
    quantity: parseNum(quantity) ?? 0,
    expiryDate: expiryDate || null,
    manufactureDate: manufactureDate || null,
    shelfLifeMonths: years === null ? null : Math.round(years * 12),
    capacityTotal: parseNum(capacityTotal),
    capacityRemaining: parseNum(capacityRemaining),
    capacityUnit: capacityUnit.trim() || null,
    notes,
  };
  const computedDue = controlType === 'shelfLife' ? lotDueDate(fields, 'shelfLife') : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveLot(lot ? { ...lot, ...fields } : newEntity<Lot>({ itemId: item.id, ...fields }));
    onClose();
  }

  async function handleDelete() {
    if (!lot || !window.confirm(t('lots.confirmDelete'))) return;
    await deleteLot(lot.id);
    onClose();
  }

  return (
    <Dialog title={lot ? t('lots.edit') : t('lots.add')} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="lot-location">{t('lots.location')}</label>
          <select id="lot-location" className="select" required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locationOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lot-qty">
            {t('lots.quantity')} {item.unit && `(${item.unit})`}
          </label>
          <input id="lot-qty" className="input" inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>

        {controlType === 'expiryDate' && (
          <div className="field">
            <label htmlFor="lot-expiry">{t('lots.expiryDate')}</label>
            <input id="lot-expiry" className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        )}

        {controlType === 'shelfLife' && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="lot-mfg">{t('lots.manufactureDate')}</label>
              <input id="lot-mfg" className="input" type="date" value={manufactureDate} onChange={(e) => setManufactureDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lot-life">{t('lots.shelfLifeYears')}</label>
              <input id="lot-life" className="input" inputMode="decimal" value={shelfLifeYears} onChange={(e) => setShelfLifeYears(e.target.value)} />
            </div>
            {computedDue && <p className="hint">{t('lots.expiresOn', { date: formatDay(computedDue, i18n.language) })}</p>}
          </div>
        )}

        {controlType === 'capacity' && (
          <>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="lot-cap-total">{t('lots.capacityTotal')}</label>
                <input id="lot-cap-total" className="input" inputMode="decimal" value={capacityTotal} onChange={(e) => setCapacityTotal(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="lot-cap-unit">{t('lots.capacityUnit')}</label>
                <input id="lot-cap-unit" className="input" placeholder={t('lots.capacityUnitPlaceholder')} value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="lot-cap-rem">{t('lots.capacityRemaining')}</label>
              <input id="lot-cap-rem" className="input" inputMode="decimal" value={capacityRemaining} onChange={(e) => setCapacityRemaining(e.target.value)} />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="lot-notes">{t('items.notes')}</label>
          <textarea id="lot-notes" className="input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="row-end">
          {lot && (
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

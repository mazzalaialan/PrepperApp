import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useInventory } from '@/modules/inventory/store';
import { Dialog } from '@/ui/Dialog';
import { parseNum } from '@/ui/numbers';
import { cropName, type Crop } from './crops';
import { saveSeedStock, seedExpiry } from './seedStock';
import type { SeedInfo } from './seeds';
import { harvestLocation } from './store';

const UNITS = ['g', 'packets', 'u'] as const;

/** Guardar semillas de un cultivo en el inventario, con el vencimiento sugerido según cuánto dura la semilla. */
export function SeedStockDialog({ crop, info, onClose }: { crop: Crop; info: SeedInfo; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locations = useInventory((s) => s.locations);
  const roots = [...locations.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const [variety, setVariety] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<(typeof UNITS)[number]>(info.cycle === 'vegetative' ? 'u' : 'packets');
  const [storedOn, setStoredOn] = useState(todayIso());
  const [expiry, setExpiry] = useState(seedExpiry(info, todayIso()) ?? '');
  // Si no se tocó el vencimiento a mano, sigue a la fecha en que se guardó.
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [locationId, setLocationId] = useState(roots[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const q = parseNum(qty);
  const valid = q !== null && q > 0 && !!storedOn;
  const years = info.yearsViable.min;

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      const locId = locationId || (await harvestLocation(t('garden.pantry'))).id;
      const base = cropName(crop, lang);
      const name = `${t(info.cycle === 'vegetative' ? 'garden.seeds.stock.itemNameParts' : 'garden.seeds.stock.itemName', { crop: base })}${variety.trim() ? ` ${variety.trim()}` : ''}`;
      await saveSeedStock({ name, unit: t(`garden.seeds.stock.units.${unit}`), quantity: q!, locationId: locId, storedOn, expiry: expiry || null });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={t('garden.seeds.stock.title', { crop: cropName(crop, lang) })} onClose={onClose}>
      {done ? (
        <div className="stack" data-testid="seed-stock-done">
          <p className="ok" role="status">{t('garden.seeds.stock.saved')}</p>
          <div className="row-end">
            <button className="btn" type="button" onClick={onClose}>{t('common.close')}</button>
            <Link className="btn btn-primary" to="/inventory/items" onClick={onClose}>{t('garden.seeds.stock.open')}</Link>
          </div>
        </div>
      ) : (
        <div className="stack" data-testid="seed-stock-form">
          <div className="field">
            <label htmlFor="seed-variety">{t('garden.seeds.stock.variety')}</label>
            <input id="seed-variety" className="input" value={variety} onChange={(e) => setVariety(e.target.value)} maxLength={60} placeholder={t('garden.seeds.stock.varietyHint')} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="seed-qty">{t('garden.seeds.stock.quantity')}</label>
              <div className="input-group">
                <input id="seed-qty" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="seed-qty" />
                <select className="select" value={unit} onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])} aria-label={t('garden.seeds.stock.unit')}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{t(`garden.seeds.stock.units.${u}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="seed-stored">{t('garden.seeds.stock.storedOn')}</label>
              <input
                id="seed-stored"
                className="input"
                type="date"
                value={storedOn}
                onChange={(e) => {
                  setStoredOn(e.target.value);
                  if (!expiryTouched && e.target.value) setExpiry(seedExpiry(info, e.target.value) ?? '');
                }}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="seed-expiry">{t('garden.seeds.stock.expiry')}</label>
            <input
              id="seed-expiry"
              className="input"
              type="date"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                setExpiryTouched(true);
              }}
              data-testid="seed-expiry"
            />
            <p className="hint" style={{ margin: 0 }}>
              {years ? t('garden.seeds.stock.expiryHint', { years: years.toLocaleString(lang) }) : t('garden.seeds.stock.expiryNone')}
            </p>
          </div>
          <div className="field">
            <label htmlFor="seed-location">{t('garden.harvestLocation')}</label>
            {roots.length ? (
              <select id="seed-location" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {roots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {'· '.repeat(l.depth - 1)}
                    {l.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="hint">{t('garden.harvestNewLocation', { name: t('garden.pantry') })}</p>
            )}
          </div>
          <div className="row-end">
            <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={!valid || busy} data-testid="seed-stock-save">
              {t('garden.seeds.stock.save')}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

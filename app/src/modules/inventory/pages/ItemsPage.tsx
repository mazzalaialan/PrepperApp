import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Plus, ScanBarcode, Search, Star } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { BarcodeScanner } from '@/ui/BarcodeScanner';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { AlertBadge } from '../components/AlertBadge';
import { quantityOf } from '../domain/stock';
import { normalize, useCategoryOptions, useWorstAlertByItem } from '../selectors';
import { useInventory } from '../store';

export function ItemsPage() {
  const { t, i18n } = useTranslation();
  const { items, lots, categories } = useInventory(
    useShallow((s) => ({ items: s.items, lots: s.lots, categories: s.categories })),
  );
  const worst = useWorstAlertByItem();
  const categoryOptions = useCategoryOptions();
  const navigate = useNavigate();
  const canScan = useCapabilities((s) => (s.caps?.barcode && s.caps.camera) ?? false);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');

  function handleScan(code: string) {
    setScanning(false);
    const match = [...items.values()].find((i) => i.barcode === code);
    navigate(match ? `/inventory/items/${match.id}` : `/inventory/items/new?barcode=${encodeURIComponent(code)}`);
  }
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const lotList = [...lots.values()];
    return [...items.values()]
      .filter((i) => !categoryId || i.categoryId === categoryId)
      .filter((i) => !favoritesOnly || i.favorite)
      .filter((i) => !q || normalize(i.name).includes(q) || i.barcode?.includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, i18n.language))
      .map((item) => ({ item, total: quantityOf(item.id, lotList) }));
  }, [items, lots, query, categoryId, favoritesOnly, i18n.language]);

  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.inventory.title')}</h1>
        <Link className="btn btn-primary" to="/inventory/items/new">
          <Plus size={20} /> {t('items.new')}
        </Link>
      </div>

      <div className="toolbar">
        <label className="search">
          <Search size={18} aria-hidden />
          <input
            className="input"
            type="search"
            placeholder={t('items.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t('items.category')}>
          <option value="">{t('items.allCategories')}</option>
          {categoryOptions.map(({ category, name }) => (
            <option key={category.id} value={category.id}>
              {name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          type="button"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          title={t('items.favoritesOnly')}
        >
          <Star size={18} fill={favoritesOnly ? 'currentColor' : 'none'} /> {t('items.favorites')}
        </button>
        {canScan && (
          <button className="btn" type="button" onClick={() => setScanning(true)}>
            <ScanBarcode size={18} /> {t('scanner.scan')}
          </button>
        )}
      </div>
      {scanning && <BarcodeScanner onDetected={handleScan} onClose={() => setScanning(false)} />}

      {rows.length === 0 ? (
        <p className="empty">{items.size === 0 ? t('items.empty') : t('items.noResults')}</p>
      ) : (
        <ul className="list">
          {rows.map(({ item, total }) => {
            const alert = worst.get(item.id);
            return (
              <li key={item.id}>
                <Link className="list-row" to={`/inventory/items/${item.id}`}>
                  <CategoryIcon category={categories.get(item.categoryId)} />
                  <span className="list-main">
                    <span className="list-title">
                      {item.favorite && <Star size={14} fill="currentColor" className="fav" aria-label={t('items.favorite')} />}
                      {item.name}
                    </span>
                    <span className="list-sub">
                      {fmt.format(total)} {item.unit}
                    </span>
                  </span>
                  {alert && <AlertBadge alert={alert} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

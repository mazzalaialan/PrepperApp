import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Calculator } from 'lucide-react';
import { categoryName } from '@/modules/inventory/domain/categories';
import { useInventory } from '@/modules/inventory/store';
import { recommendationShortages, type RecommendationShortage } from './calc';
import { useRecommendations } from './store';

/** Reglas de recomendaciones que hoy no se cumplen. */
export function useRecommendationShortages(): RecommendationShortage[] {
  const { rules, members } = useRecommendations(useShallow((s) => ({ rules: s.rules, members: s.members })));
  const { items, lots } = useInventory(useShallow((s) => ({ items: s.items, lots: s.lots })));
  return useMemo(
    () => recommendationShortages([...rules.values()], [...members.values()], items, [...lots.values()]),
    [rules, members, items, lots],
  );
}

export function RecommendationShortageList({ shortages, limit }: { shortages: RecommendationShortage[]; limit?: number }) {
  const { t, i18n } = useTranslation();
  const { items, categories } = useInventory(useShallow((s) => ({ items: s.items, categories: s.categories })));
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  return (
    <ul className="list">
      {shortages.slice(0, limit).map(({ rule, result }) => {
        const category = categories.get(rule.categoryId ?? '');
        const name = rule.description || (rule.itemId ? items.get(rule.itemId)?.name : category && categoryName(category, t));
        const unit = rule.itemId ? (items.get(rule.itemId)?.unit ?? rule.unit) : rule.unit;
        return (
          <li key={rule.id}>
            <Link className="list-row" to="/inventory/recommendations">
              <Calculator size={22} aria-hidden style={{ color: 'var(--warn)', flex: 'none' }} />
              <span className="list-main">
                <span className="list-title">{name}</span>
                <span className="list-sub">
                  {result.daysCovered !== null && t('recommendations.lasts', { count: Math.floor(result.daysCovered) })}
                </span>
              </span>
              <span className="pill pill-warn">{t('recommendations.missing', { missing: fmt.format(result.missing), unit })}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

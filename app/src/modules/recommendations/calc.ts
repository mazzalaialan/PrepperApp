import type { HouseholdMember, Id, Item, Lot, RecommendationRule } from '@/core/model/types';
import { normalize } from '@/modules/inventory/selectors';
import { quantityOf } from '@/modules/inventory/domain/stock';

/**
 * Recomendaciones (ARQUITECTURA §5.2): las reglas las define el usuario; la
 * app solo calcula cuánto haría falta y cuánto hay. Nunca impone un stock mínimo.
 */

export interface RuleResult {
  /** Personas (o animales) a los que aplica la regla. */
  people: number;
  dailyNeed: number;
  target: number;
  current: number;
  missing: number;
  /** Días que alcanza lo que hay; `null` si la regla no consume nada. */
  daysCovered: number | null;
  /** Artículos que se contaron (en reglas por categoría, solo los de la misma unidad). */
  countedItems: Item[];
}

const sameUnit = (a: string, b: string) => normalize(a.trim()) === normalize(b.trim());

export function membersFor(rule: RecommendationRule, members: HouseholdMember[]): HouseholdMember[] {
  return rule.memberIds.length ? members.filter((m) => rule.memberIds.includes(m.id)) : members;
}

export function evaluateRule(rule: RecommendationRule, members: HouseholdMember[], items: Map<Id, Item>, lots: Lot[]): RuleResult {
  const people = membersFor(rule, members).reduce((sum, m) => sum + m.count, 0);
  const dailyNeed = people * rule.quantityPerMemberPerDay;
  const target = dailyNeed * rule.targetDays;

  let countedItems: Item[] = [];
  if (rule.itemId) {
    const item = items.get(rule.itemId);
    countedItems = item ? [item] : [];
  } else if (rule.categoryId) {
    // Una categoría mezcla unidades ("latas", "kg"): solo se suman las que coinciden con la de la regla.
    countedItems = [...items.values()].filter((i) => i.categoryId === rule.categoryId && sameUnit(i.unit, rule.unit));
  }
  const current = round(countedItems.reduce((sum, i) => sum + quantityOf(i.id, lots), 0));

  return {
    people,
    dailyNeed: round(dailyNeed),
    target: round(target),
    current,
    missing: round(Math.max(0, target - current)),
    daysCovered: dailyNeed > 0 ? current / dailyNeed : null,
    countedItems,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

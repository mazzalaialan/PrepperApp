import type { RecommendationRule } from '@/core/model/types';
import { systemCategoryId } from '@/modules/inventory/domain/categories';

/**
 * Reglas de ejemplo (ARQUITECTURA §5.2: las reglas son del usuario; estas son
 * solo un punto de partida, se editan, se destildan o se borran). Tres
 * plazos: 3 días (lo mínimo que piden Defensa Civil y Ready.gov para una
 * mochila de emergencia), 7 días y 6 meses. Se controla solo el de 7 días.
 *
 * Agua: 3 L por persona por día para tomar y cocinar (el Proyecto Esfera
 * pide 2,5 a 3 L solo para tomar; Ready.gov, unos 3,8 L con higiene).
 * Alimentos: 0,5 kg por persona por día de no perecederos secos (arroz,
 * fideos, legumbres: unas 1.800 kcal).
 */

export const EXAMPLE_PLANS = [
  { days: 3, active: false },
  { days: 7, active: true },
  { days: 180, active: false },
] as const;

const KINDS = [
  { key: 'water', category: 'water', unit: 'L', qty: 3 },
  { key: 'food', category: 'food', unit: 'kg', qty: 0.5 },
] as const;

/** Id fijo por regla de ejemplo: volver a agregarlas no las duplica. */
export const exampleId = (kind: string, days: number) => `example-${kind}-${days}`;

export function exampleRules(t: (key: string) => string, now = new Date().toISOString()): RecommendationRule[] {
  return EXAMPLE_PLANS.flatMap((plan) =>
    KINDS.map((k) => ({
      id: exampleId(k.key, plan.days),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      description: t(`recommendations.examples.${k.key}`),
      categoryId: systemCategoryId(k.category),
      itemId: null,
      quantityPerMemberPerDay: k.qty,
      unit: k.unit,
      targetDays: plan.days,
      memberIds: [],
      active: plan.active,
    })),
  );
}

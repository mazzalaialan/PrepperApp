import type { AlertConfig, Category, Id, IsoDay, Item, Lot } from '@/core/model/types';
import { addDays, addMonths, daysBetween } from './dates';

/** Herencia de configuración: artículo → categoría (ARQUITECTURA §6.2). */
export function effectiveConfig(item: Item, category: Category | undefined): AlertConfig {
  return {
    controlType: item.controlType ?? category?.controlType ?? 'none',
    alertsEnabled: item.alertsEnabled ?? category?.alertsEnabled ?? false,
    alertLeadDays: item.alertLeadDays ?? category?.alertLeadDays ?? 30,
    alertCapacityPct: item.alertCapacityPct ?? category?.alertCapacityPct ?? 20,
  };
}

/** Fecha en que vence el lote según el tipo de control, o `null` si no aplica o faltan datos. */
export function lotDueDate(
  lot: Pick<Lot, 'expiryDate' | 'manufactureDate' | 'shelfLifeMonths'>,
  controlType: AlertConfig['controlType'],
): IsoDay | null {
  switch (controlType) {
    case 'expiryDate':
      return lot.expiryDate;
    case 'shelfLife':
      return lot.manufactureDate && lot.shelfLifeMonths ? addMonths(lot.manufactureDate, lot.shelfLifeMonths) : null;
    default:
      return null;
  }
}

/** Porcentaje restante (0–100) de un lote de tipo capacidad, o `null` si faltan datos. */
export function capacityPct(lot: Lot): number | null {
  if (lot.capacityTotal == null || lot.capacityRemaining == null || lot.capacityTotal <= 0) return null;
  return Math.max(0, Math.min(100, (lot.capacityRemaining / lot.capacityTotal) * 100));
}

export type AlertKind = 'expired' | 'expiring' | 'capacityEmpty' | 'capacityLow';

export interface LotAlert {
  kind: AlertKind;
  lotId: Id;
  itemId: Id;
  /** Vencimientos: fecha de vencimiento y días restantes (negativos si ya venció). */
  dueDate?: IsoDay;
  daysLeft?: number;
  /** Capacidad: porcentaje restante. */
  pct?: number;
  /** Desde qué día corresponde avisar (para el índice de notificaciones). */
  notifyFrom: IsoDay;
}

/** Severidad para ordenar: lo más urgente primero. */
const SEVERITY: Record<AlertKind, number> = { expired: 0, capacityEmpty: 1, expiring: 2, capacityLow: 3 };

export function lotAlert(lot: Lot, config: AlertConfig, today: IsoDay): LotAlert | null {
  if (!config.alertsEnabled || lot.deletedAt || lot.quantity <= 0) return null;

  if (config.controlType === 'capacity') {
    const pct = capacityPct(lot);
    if (pct === null || pct > config.alertCapacityPct) return null;
    return { kind: pct === 0 ? 'capacityEmpty' : 'capacityLow', lotId: lot.id, itemId: lot.itemId, pct, notifyFrom: today };
  }

  const dueDate = lotDueDate(lot, config.controlType);
  if (!dueDate) return null;
  const notifyFrom = addDays(dueDate, -config.alertLeadDays);
  if (today < notifyFrom) return null;
  const daysLeft = daysBetween(today, dueDate);
  return { kind: daysLeft < 0 ? 'expired' : 'expiring', lotId: lot.id, itemId: lot.itemId, dueDate, daysLeft, notifyFrom };
}

export interface AlertInputs {
  lots: Lot[];
  items: Map<Id, Item>;
  categories: Map<Id, Category>;
  today: IsoDay;
}

export function computeAlerts({ lots, items, categories, today }: AlertInputs): LotAlert[] {
  const alerts: LotAlert[] = [];
  for (const lot of lots) {
    const item = items.get(lot.itemId);
    if (!item || item.deletedAt) continue;
    const alert = lotAlert(lot, effectiveConfig(item, categories.get(item.categoryId)), today);
    if (alert) alerts.push(alert);
  }
  return alerts.sort(
    (a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || (a.pct ?? 0) - (b.pct ?? 0),
  );
}

/**
 * Próximos avisos programables (vencimientos que todavía no entraron en
 * ventana), para el índice que usan las notificaciones en segundo plano.
 */
export function upcomingNotifications({ lots, items, categories }: Omit<AlertInputs, 'today'>) {
  const rows: { lotId: Id; itemName: string; dueDate: IsoDay; notifyFrom: IsoDay }[] = [];
  for (const lot of lots) {
    const item = items.get(lot.itemId);
    if (!item || item.deletedAt || lot.deletedAt || lot.quantity <= 0) continue;
    const config = effectiveConfig(item, categories.get(item.categoryId));
    if (!config.alertsEnabled) continue;
    const dueDate = lotDueDate(lot, config.controlType);
    if (dueDate) rows.push({ lotId: lot.id, itemName: item.name, dueDate, notifyFrom: addDays(dueDate, -config.alertLeadDays) });
  }
  return rows;
}

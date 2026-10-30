import { nowIso } from '@/core/model/entity';
import type { Category, ControlType } from '@/core/model/types';

export const DEFAULT_LEAD_DAYS = 30;
export const DEFAULT_CAPACITY_PCT = 20;

interface SystemCategorySpec {
  key: string;
  icon: string;
  color: string;
  controlType: ControlType;
}

/**
 * Categorías del sistema (ARQUITECTURA §5.2). Los ids son fijos (`sys-<key>`)
 * para que dos dispositivos no creen duplicados al sincronizar.
 */
const SYSTEM_CATEGORIES: SystemCategorySpec[] = [
  { key: 'water', icon: 'droplets', color: '#5f85ad', controlType: 'expiryDate' },
  { key: 'food', icon: 'wheat', color: '#c9a04a', controlType: 'expiryDate' },
  { key: 'waterFilters', icon: 'filter', color: '#4f9aa8', controlType: 'capacity' },
  { key: 'airFilters', icon: 'wind', color: '#8a9bb0', controlType: 'expiryDate' },
  { key: 'firstAid', icon: 'briefcase-medical', color: '#b84a30', controlType: 'expiryDate' },
  { key: 'energy', icon: 'battery-charging', color: '#d0a03c', controlType: 'shelfLife' },
  { key: 'safety', icon: 'shield', color: '#c4573a', controlType: 'expiryDate' },
  { key: 'fire', icon: 'flame', color: '#d8763a', controlType: 'none' },
  { key: 'shelter', icon: 'tent', color: '#6f9e4c', controlType: 'none' },
  { key: 'clothing', icon: 'shirt', color: '#7d6aa8', controlType: 'none' },
  { key: 'hygiene', icon: 'bath', color: '#6aa89a', controlType: 'expiryDate' },
  { key: 'tools', icon: 'wrench', color: '#9a8a74', controlType: 'none' },
  { key: 'entertainment', icon: 'gamepad', color: '#a86a8f', controlType: 'none' },
  { key: 'other', icon: 'package', color: '#7a8696', controlType: 'none' },
];

export function systemCategoryId(key: string): string {
  return `sys-${key}`;
}

export function buildSystemCategories(): Category[] {
  const now = nowIso();
  return SYSTEM_CATEGORIES.map((spec, i) => ({
    id: systemCategoryId(spec.key),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    nameKey: `categoryNames.${spec.key}`,
    name: '',
    isSystem: true,
    hidden: false,
    icon: spec.icon,
    color: spec.color,
    order: i,
    controlType: spec.controlType,
    alertsEnabled: spec.controlType !== 'none',
    alertLeadDays: DEFAULT_LEAD_DAYS,
    alertCapacityPct: DEFAULT_CAPACITY_PCT,
  }));
}

/** Devuelve las categorías del sistema que falten (p. ej. agregadas en una versión nueva de la app). */
export function missingSystemCategories(existing: Category[]): Category[] {
  const ids = new Set(existing.map((c) => c.id));
  return buildSystemCategories().filter((c) => !ids.has(c.id));
}

/** Nombre visible: el renombre del usuario gana sobre la traducción del sistema. */
export function categoryName(cat: Category, t: (key: string) => string): string {
  return cat.name || (cat.nameKey ? t(cat.nameKey) : '');
}

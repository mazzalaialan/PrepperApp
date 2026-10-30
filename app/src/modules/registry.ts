import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BellRing,
  BookOpen,
  Calculator,
  CloudSun,
  Compass,
  FileText,
  Map as MapIcon,
  MapPin,
  Moon,
  Package,
  Sparkles,
  Triangle,
  Warehouse,
} from 'lucide-react';
import type { Capability, CapabilityMap } from '@/core/capabilities/capabilities';

export type Section = 'inventory' | 'field' | 'library';
export type Phase = 'F1' | 'F3' | 'F4' | 'F5' | 'F6';

export interface ModuleDef {
  id: string;
  section: Section;
  icon: LucideIcon;
  /** Fase en la que se implementa (ARQUITECTURA §16). */
  phase: Phase;
  /** `true` cuando el módulo ya tiene pantalla. */
  implemented: boolean;
  /** Sin estas capacidades el módulo no puede funcionar: se muestra deshabilitado. */
  requires?: Capability[];
  /** Sin estas capacidades funciona con carga manual. */
  degradesWithout?: Capability[];
}

export const MODULES: ModuleDef[] = [
  { id: 'inventory', section: 'inventory', icon: Package, phase: 'F1', implemented: false },
  { id: 'locations', section: 'inventory', icon: Warehouse, phase: 'F1', implemented: false },
  { id: 'alerts', section: 'inventory', icon: BellRing, phase: 'F1', implemented: false },
  { id: 'backup', section: 'inventory', icon: Archive, phase: 'F1', implemented: false },
  { id: 'documents', section: 'inventory', icon: FileText, phase: 'F3', implemented: false },
  { id: 'recommendations', section: 'inventory', icon: Calculator, phase: 'F3', implemented: false },
  { id: 'compass', section: 'field', icon: Compass, phase: 'F3', implemented: false, requires: ['orientation'] },
  { id: 'inclinometer', section: 'field', icon: Triangle, phase: 'F3', implemented: false, requires: ['motion'] },
  { id: 'waypoints', section: 'field', icon: MapPin, phase: 'F3', implemented: false, degradesWithout: ['geolocation'] },
  { id: 'astronomy', section: 'field', icon: Moon, phase: 'F3', implemented: false, degradesWithout: ['geolocation'] },
  { id: 'weather', section: 'field', icon: CloudSun, phase: 'F3', implemented: false },
  { id: 'maps', section: 'field', icon: MapIcon, phase: 'F5', implemented: false, degradesWithout: ['geolocation'] },
  { id: 'starmap', section: 'field', icon: Sparkles, phase: 'F6', implemented: false, degradesWithout: ['orientation'] },
  { id: 'library', section: 'library', icon: BookOpen, phase: 'F4', implemented: false },
];

export type ModuleStatus =
  | { kind: 'available' }
  | { kind: 'degraded'; missing: Capability[] }
  | { kind: 'unavailable'; missing: Capability[] }
  | { kind: 'soon'; phase: Phase };

/** La falta de una capacidad requerida tiene prioridad: el usuario debe saber que en este dispositivo nunca va a andar. */
export function moduleStatus(mod: ModuleDef, caps: CapabilityMap): ModuleStatus {
  const missingRequired = (mod.requires ?? []).filter((c) => !caps[c]);
  if (missingRequired.length) return { kind: 'unavailable', missing: missingRequired };
  if (!mod.implemented) return { kind: 'soon', phase: mod.phase };
  const missingOptional = (mod.degradesWithout ?? []).filter((c) => !caps[c]);
  if (missingOptional.length) return { kind: 'degraded', missing: missingOptional };
  return { kind: 'available' };
}

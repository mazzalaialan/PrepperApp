import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  BookHeart,
  BookOpen,
  BriefcaseMedical,
  CalendarDays,
  Calculator,
  CloudSun,
  Compass,
  FileText,
  HeartPulse,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Moon,
  Package,
  Phone,
  Radio,
  Route as RouteIcon,
  Sparkles,
  Sprout,
  Tags,
  Triangle,
  Warehouse,
} from 'lucide-react';
import type { Capability, CapabilityMap } from '@/core/capabilities/capabilities';

/** En el orden en que se muestran en Inicio. */
export const SECTIONS = ['firstAid', 'documents', 'orientation', 'weather', 'inventory', 'garden', 'library'] as const;
export type Section = (typeof SECTIONS)[number];
export type Phase = 'F1' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8';

export interface ModuleDef {
  id: string;
  section: Section;
  icon: LucideIcon;
  /** Ruta de la pantalla del módulo. */
  path?: string;
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
  { id: 'inventory', section: 'inventory', icon: Package, phase: 'F1', implemented: true, path: '/inventory/items' },
  { id: 'locations', section: 'inventory', icon: Warehouse, phase: 'F1', implemented: true, path: '/inventory/locations' },
  { id: 'alerts', section: 'inventory', icon: BellRing, phase: 'F1', implemented: true, path: '/inventory/alerts' },
  { id: 'categories', section: 'inventory', icon: Tags, phase: 'F1', implemented: true, path: '/inventory/categories' },
  { id: 'recommendations', section: 'inventory', icon: Calculator, phase: 'F3', implemented: true, path: '/inventory/recommendations' },
  { id: 'contacts', section: 'firstAid', icon: Phone, phase: 'F3', implemented: true, path: '/first-aid/contacts' },
  { id: 'myLocation', section: 'firstAid', icon: LocateFixed, phase: 'F3', implemented: true, path: '/first-aid/location', degradesWithout: ['geolocation'] },
  { id: 'medical', section: 'firstAid', icon: HeartPulse, phase: 'F3', implemented: true, path: '/first-aid/medical' },
  { id: 'kits', section: 'firstAid', icon: BriefcaseMedical, phase: 'F3', implemented: true, path: '/first-aid/kits' },
  { id: 'firstAidGuides', section: 'firstAid', icon: BookHeart, phase: 'F4', implemented: false },
  { id: 'radio', section: 'firstAid', icon: Radio, phase: 'F3', implemented: true, path: '/first-aid/radio' },
  { id: 'documents', section: 'documents', icon: FileText, phase: 'F3', implemented: true, path: '/documents' },
  { id: 'compass', section: 'orientation', icon: Compass, phase: 'F3', implemented: true, path: '/orientation/compass', requires: ['orientation'] },
  { id: 'inclinometer', section: 'orientation', icon: Triangle, phase: 'F3', implemented: true, path: '/orientation/inclinometer', requires: ['motion'] },
  { id: 'waypoints', section: 'orientation', icon: MapPin, phase: 'F3', implemented: true, path: '/orientation/waypoints', degradesWithout: ['geolocation'] },
  { id: 'routes', section: 'orientation', icon: RouteIcon, phase: 'F3', implemented: true, path: '/orientation/routes', degradesWithout: ['geolocation'] },
  { id: 'maps', section: 'orientation', icon: MapIcon, phase: 'F5', implemented: true, path: '/orientation/maps', degradesWithout: ['geolocation'] },
  { id: 'starmap', section: 'orientation', icon: Sparkles, phase: 'F6', implemented: true, path: '/orientation/starmap', degradesWithout: ['orientation'] },
  { id: 'weather', section: 'weather', icon: CloudSun, phase: 'F3', implemented: true, path: '/weather/forecast' },
  { id: 'weatherMap', section: 'weather', icon: MapIcon, phase: 'F5', implemented: true, path: '/weather/map' },
  { id: 'astronomy', section: 'weather', icon: Moon, phase: 'F3', implemented: true, path: '/weather/sky', degradesWithout: ['geolocation'] },
  { id: 'gardenCalendar', section: 'garden', icon: CalendarDays, phase: 'F7', implemented: false },
  { id: 'gardenBeds', section: 'garden', icon: Sprout, phase: 'F8', implemented: false },
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

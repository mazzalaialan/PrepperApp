import { create } from 'zustand';
import { db } from '@/core/db/db';
import type { UnitSystem } from '@/core/units/units';

/**
 * Ajustes no sensibles: se guardan en claro porque se necesitan antes de
 * desbloquear (idioma y tema de la pantalla de desbloqueo).
 */
export type Language = 'es' | 'en';
export type Theme = 'dark' | 'light' | 'red';

export interface Settings {
  language: Language;
  theme: Theme;
  units: UnitSystem;
  autoLockMinutes: number;
  serverUrl: string;
  weatherUrl: string;
  notificationsEnabled: boolean;
  /** Hora local (0–23) a partir de la cual el servidor envía el aviso del día. */
  notifyHour: number;
  /** Referencia de la brújula: norte verdadero (corrige la declinación) o magnético. */
  northReference: NorthReference;
  /**
   * Lugar para sol, luna y clima: un waypoint guardado (solo su id; las
   * coordenadas quedan cifradas) o `null` para usar el GPS.
   */
  placeWaypointId: string | null;
  /** Avisar si va a llover donde estoy (GPS con la app abierta; última ubicación conocida en segundo plano). */
  rainAlertsHere: boolean;
}

export type NorthReference = 'true' | 'magnetic';

export const LANGUAGES: Language[] = ['es', 'en'];
export const THEMES: Theme[] = ['dark', 'light', 'red'];
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60];

function detectLanguage(): Language {
  return globalThis.navigator?.language?.toLowerCase().startsWith('es') === false ? 'en' : 'es';
}

export const DEFAULT_SETTINGS: Settings = {
  language: detectLanguage(),
  theme: 'dark',
  units: 'metric',
  autoLockMinutes: 5,
  serverUrl: '',
  weatherUrl: 'https://api.open-meteo.com',
  notificationsEnabled: false,
  notifyHour: 9,
  northReference: 'true',
  placeWaypointId: null,
  rainAlertsHere: false,
};

const SETTINGS_KEY = 'app';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (changes: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const stored = (await db.settings.get(SETTINGS_KEY))?.value as Partial<Settings> | undefined;
    // Mezclar con los valores por defecto permite agregar ajustes nuevos sin migración.
    set({ settings: { ...DEFAULT_SETTINGS, ...stored }, loaded: true });
  },
  async update(changes) {
    const settings = { ...get().settings, ...changes };
    set({ settings });
    await db.settings.put({ key: SETTINGS_KEY, value: settings });
  },
}));

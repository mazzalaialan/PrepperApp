import { create } from 'zustand';
import { db } from '@/core/db/db';
import type { UnitSystem } from '@/core/units/units';

/**
 * Ajustes no sensibles: se guardan en claro porque se necesitan antes de
 * desbloquear (idioma y tema de la pantalla de desbloqueo).
 */
export type Language = 'es' | 'en';
/** `saver`: ahorro de batería (negro puro para pantallas OLED y menos trabajo de fondo; ver core/power/saver.ts). */
export type Theme = 'dark' | 'light' | 'red' | 'saver';

export interface Settings {
  language: Language;
  theme: Theme;
  units: UnitSystem;
  autoLockMinutes: number;
  serverUrl: string;
  /** Ya se le cargó el servidor por defecto (para no volver a ponerlo si lo vació). */
  serverDefaulted: boolean;
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
  /**
   * Con el servidor propio y las notificaciones activadas: mandarle la última
   * ubicación conocida (~1 km) para avisar de lluvia y rayos cerca con la app
   * cerrada. Prendido por defecto; se apaga en Ajustes → Notificaciones.
   */
  serverLocation: boolean;
  /** Rojo nocturno automático: nunca, en un horario fijo o desde el anochecer hasta el amanecer. */
  redSchedule: RedSchedule;
  /** Horario fijo, "HH:MM" (si `redFrom` > `redTo`, cruza la medianoche). */
  redFrom: string;
  redTo: string;
  /**
   * Ubicación aproximada para calcular el anochecer, redondeada a 0,5° (~50 km):
   * se guarda en claro porque el tema se aplica incluso con la app bloqueada.
   */
  duskPlace: { lat: number; lon: number } | null;
  /** Prender el rojo nocturno al abrir el mapa estelar. */
  starmapRed: boolean;
  starmapLayers: StarmapLayers;
  weatherMapLayers: WeatherMapLayers;
  /** Qué dato del clima se dibuja en cada provincia. */
  weatherMapValue: WeatherMapValue;
  /** Capas de los mapas offline de Orientación. */
  mapLayers: MapLayers;
  /** Línea de nieve puesta a mano para la capa de avalanchas (m); `null` = la estima la app con la isoterma de 0 °C. */
  snowlineManual: number | null;
  /** Al seguir un track: el dibujo liviano o el mapa (en 2D o 3D). */
  trackFollowView: 'drawing' | 'map';
  /** Leer en voz alta los pasos de las guías de primeros auxilios. */
  guideVoice: boolean;
  /** Entorno de la guía de primeros auxilios: con ayuda cerca o lejos. */
  firstAidEnv: FirstAidEnv;
  /** País: define los números de emergencia y de la guía. */
  country: Country;
}

export type FirstAidEnv = 'city' | 'wild';
export type Country = 'AR' | 'CL' | 'UY';
export const COUNTRIES: Country[] = ['AR', 'CL', 'UY'];

/** Por la zona horaria del dispositivo (Chile y Uruguay tienen la suya); si no, Argentina. */
export function detectCountry(): Country {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  if (/^America\/(Santiago|Punta_Arenas)$|^Pacific\/Easter$/.test(zone)) return 'CL';
  if (zone === 'America/Montevideo') return 'UY';
  return 'AR';
}

export interface MapLayers {
  hillshade: boolean;
  contours: boolean;
  /** Mis waypoints y rutas. */
  mine: boolean;
  /** Tracks importados (GPX). */
  tracks: boolean;
  /** Riesgo de avalancha por pendiente (con los colores del inclinómetro), calculado con la elevación descargada. */
  slope: boolean;
  /** Relieve en 3D (el mapa se puede inclinar); apagado es el mapa plano. */
  terrain3d: boolean;
}

/** Capas del Mapa de Meteorología. Las que usan internet solo se descargan si están prendidas. */
export interface WeatherMapLayers {
  satellite: boolean;
  radar: boolean;
  regionWeather: boolean;
  earthquakes: boolean;
  /** Alertas de GDACS: ciclones, inundaciones, sequías, incendios forestales y erupciones. */
  hazards: boolean;
  fires: boolean;
  volcanoes: boolean;
  waypoints: boolean;
  /** Lluvia estimada por el servidor propio con el infrarrojo del GOES-19 (toda la región, cada 10 min). */
  satRain: boolean;
  /** Rayos de los últimos minutos (GOES-19, desde el servidor propio) y anillos de 10, 20 y 30 km alrededor mío. */
  lightning: boolean;
}

export type WeatherMapValue = 'temp' | 'rain' | 'wind';

export type NorthReference = 'true' | 'magnetic';
export type RedSchedule = 'off' | 'custom' | 'dusk';

export interface StarmapLayers {
  constellationLines: boolean;
  constellationNames: boolean;
  starNames: boolean;
  planets: boolean;
  guide: boolean;
  /** Escala de acimut y círculos de altura (vista de cámara). */
  grid: boolean;
}

export const LANGUAGES: Language[] = ['es', 'en'];
export const THEMES: Theme[] = ['dark', 'light', 'red', 'saver'];
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60];

function detectLanguage(): Language {
  return globalThis.navigator?.language?.toLowerCase().startsWith('es') === false ? 'en' : 'es';
}

/** Servidor VikArg que viene cargado (se puede cambiar o vaciar en Ajustes). */
export const DEFAULT_SERVER_URL = 'https://valhallarust2.ddns.net';

export const DEFAULT_SETTINGS: Settings = {
  language: detectLanguage(),
  theme: 'dark',
  units: 'metric',
  autoLockMinutes: 5,
  serverUrl: DEFAULT_SERVER_URL,
  serverDefaulted: true,
  weatherUrl: 'https://api.open-meteo.com',
  notificationsEnabled: false,
  notifyHour: 9,
  northReference: 'true',
  placeWaypointId: null,
  rainAlertsHere: false,
  serverLocation: true,
  redSchedule: 'off',
  redFrom: '21:00',
  redTo: '07:00',
  duskPlace: null,
  starmapRed: true,
  starmapLayers: { constellationLines: true, constellationNames: true, starNames: true, planets: true, guide: true, grid: true },
  weatherMapLayers: { satellite: true, radar: false, regionWeather: true, earthquakes: true, hazards: true, fires: false, volcanoes: true, waypoints: true, satRain: true, lightning: true },
  weatherMapValue: 'temp',
  mapLayers: { hillshade: true, contours: true, mine: true, tracks: true, slope: false, terrain3d: false },
  snowlineManual: null,
  trackFollowView: 'drawing',
  guideVoice: false,
  firstAidEnv: 'city',
  country: detectCountry(),
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
    set({
      settings: {
        ...DEFAULT_SETTINGS,
        ...stored,
        // Capas nuevas del mapa estelar aparecen activadas aunque ya haya preferencias guardadas.
        starmapLayers: { ...DEFAULT_SETTINGS.starmapLayers, ...stored?.starmapLayers },
        weatherMapLayers: { ...DEFAULT_SETTINGS.weatherMapLayers, ...stored?.weatherMapLayers },
        mapLayers: { ...DEFAULT_SETTINGS.mapLayers, ...stored?.mapLayers },
        // Quien ya tenía la app sin servidor recibe el que viene cargado, una sola vez:
        // si después lo vacía a propósito, queda vacío.
        ...(stored && !stored.serverDefaulted && !stored.serverUrl ? { serverUrl: DEFAULT_SERVER_URL } : {}),
        serverDefaulted: true,
      },
      loaded: true,
    });
  },
  async update(changes) {
    const settings = { ...get().settings, ...changes };
    set({ settings });
    await db.settings.put({ key: SETTINGS_KEY, value: settings });
  },
}));

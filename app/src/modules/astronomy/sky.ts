import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  NextMoonQuarter,
  Observer,
  SearchAltitude,
  SearchHourAngle,
  SearchMoonQuarter,
  SearchRiseSet,
} from 'astronomy-engine';

/**
 * Sol y luna para un lugar y un día, calculados en el dispositivo (sin conexión).
 * El "día" va de medianoche a medianoche en la zona horaria del dispositivo.
 */

export interface Place {
  lat: number;
  lon: number;
  /** Metros sobre el nivel del mar (cambia apenas la salida y puesta). */
  alt?: number | null;
}

export interface SunDay {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Crepúsculos: el sol 6°, 12° y 18° bajo el horizonte. */
  civilDawn: Date | null;
  civilDusk: Date | null;
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  astronomicalDawn: Date | null;
  astronomicalDusk: Date | null;
  /** Duración del día en ms; en día o noche polar, 24 h o 0. */
  daylightMs: number;
  /** Sin salida ni puesta ese día: `day` = sol todo el día, `night` = no sale. */
  polar: 'day' | 'night' | null;
}

const DAY_MS = 86_400_000;

function observer(p: Place): Observer {
  return new Observer(p.lat, p.lon, p.alt ?? 0);
}

/** Primer evento dentro del día [start, start + 24 h), o `null`. */
function within<T extends { date: Date }>(event: T | null, start: Date): Date | null {
  if (!event) return null;
  return event.date.getTime() < start.getTime() + DAY_MS ? event.date : null;
}

export function sunDay(place: Place, dayStart: Date): SunDay {
  const o = observer(place);
  const rise = within(SearchRiseSet(Body.Sun, o, +1, dayStart, 1), dayStart);
  const set = within(SearchRiseSet(Body.Sun, o, -1, dayStart, 1), dayStart);
  const noon = SearchHourAngle(Body.Sun, o, 0, dayStart).time.date;
  const twilight = (altitude: number, direction: 1 | -1) =>
    within(SearchAltitude(Body.Sun, o, direction, dayStart, 1, altitude), dayStart);

  let polar: SunDay['polar'] = null;
  let daylightMs: number;
  if (rise && set) {
    // Si se pone antes de salir (cerca de los círculos polares) la luz es lo que queda fuera de la noche.
    daylightMs = set > rise ? set.getTime() - rise.getTime() : DAY_MS - (rise.getTime() - set.getTime());
  } else if (!rise && !set) {
    // Sin eventos: el sol está siempre arriba o siempre abajo; se mira su altura al mediodía.
    const up = sunAltitudeAt(o, noon) > 0;
    polar = up ? 'day' : 'night';
    daylightMs = up ? DAY_MS : 0;
  } else {
    // Solo sale o solo se pone: luz desde la salida hasta medianoche, o desde medianoche hasta la puesta.
    daylightMs = rise ? dayStart.getTime() + DAY_MS - rise.getTime() : set!.getTime() - dayStart.getTime();
  }

  return {
    sunrise: rise,
    sunset: set,
    solarNoon: noon,
    civilDawn: twilight(-6, 1),
    civilDusk: twilight(-6, -1),
    nauticalDawn: twilight(-12, 1),
    nauticalDusk: twilight(-12, -1),
    astronomicalDawn: twilight(-18, 1),
    astronomicalDusk: twilight(-18, -1),
    daylightMs,
    polar,
  };
}

/** Altura del sol sobre el horizonte, en grados. */
function sunAltitudeAt(o: Observer, when: Date): number {
  const eq = Equator(Body.Sun, when, o, true, true);
  return Horizon(when, o, eq.ra, eq.dec, 'normal').altitude;
}

export type MoonPhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

/** Nombre de la fase a partir del ángulo (0 = nueva, 90 = cuarto creciente, 180 = llena, 270 = menguante). */
export function phaseName(angle: number): MoonPhaseName {
  const names: MoonPhaseName[] = ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'];
  return names[Math.round((((angle % 360) + 360) % 360) / 45) % 8]!;
}

export interface MoonDay {
  /** Ángulo de fase en grados [0, 360). */
  phaseAngle: number;
  phase: MoonPhaseName;
  /** Fracción iluminada 0–1. */
  illumination: number;
  moonrise: Date | null;
  moonset: Date | null;
  /** Próximas fases principales (nueva, creciente, llena, menguante) desde el inicio del día. */
  nextQuarters: { phase: 'new' | 'firstQuarter' | 'full' | 'lastQuarter'; date: Date }[];
}

const QUARTERS = ['new', 'firstQuarter', 'full', 'lastQuarter'] as const;

export function moonDay(place: Place, dayStart: Date): MoonDay {
  const o = observer(place);
  // La fase se informa al mediodía local del día elegido.
  const midday = new Date(dayStart.getTime() + DAY_MS / 2);
  const phaseAngle = MoonPhase(midday);
  const nextQuarters: MoonDay['nextQuarters'] = [];
  let q = SearchMoonQuarter(dayStart);
  for (let i = 0; i < 4; i++) {
    nextQuarters.push({ phase: QUARTERS[q.quarter]!, date: q.time.date });
    q = NextMoonQuarter(q);
  }
  return {
    phaseAngle,
    phase: phaseName(phaseAngle),
    illumination: Illumination(Body.Moon, midday).phase_fraction,
    moonrise: within(SearchRiseSet(Body.Moon, o, +1, dayStart, 1), dayStart),
    moonset: within(SearchRiseSet(Body.Moon, o, -1, dayStart, 1), dayStart),
    nextQuarters,
  };
}

/** Medianoche local del día que contiene `date`. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

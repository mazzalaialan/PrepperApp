import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { ACTIVITIES, type ActivityKind } from './activities';
import { formatClock, formatPace } from './stats';

const KM_PER_MILE = 1.609344;

/** Formatos del Entrenamiento según las unidades elegidas (ritmo en min/km o min/mi; velocidad en km/h o mph). */
export function useTrainingFormat() {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const imperial = units === 'imperial';
  const nf = (digits: number) => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return {
    distance: (m: number) => formatDistance(m, units, i18n.language),
    altitude: (m: number) => formatAltitude(m, units, i18n.language),
    clock: formatClock,
    pace: (sPerKm: number) => (sPerKm > 0 ? `${formatPace(imperial ? sPerKm * KM_PER_MILE : sPerKm)} ${imperial ? '/mi' : '/km'}` : '—'),
    speed: (kmh: number) => (kmh > 0 ? `${nf(1).format(imperial ? kmh / KM_PER_MILE : kmh)} ${imperial ? 'mph' : 'km/h'}` : '—'),
    /** Ritmo a pie y velocidad en bici y remo, según la actividad. */
    effort: (kind: ActivityKind, w: { paceSPerKm: number; avgSpeedKmh: number }) => (ACTIVITIES[kind].measure === 'pace' ? `${formatPace(imperial ? w.paceSPerKm * KM_PER_MILE : w.paceSPerKm)} ${imperial ? '/mi' : '/km'}` : `${nf(1).format(imperial ? w.avgSpeedKmh / KM_PER_MILE : w.avgSpeedKmh)} ${imperial ? 'mph' : 'km/h'}`),
    kcal: (n: number) => `${nf(0).format(n)} kcal`,
    date: (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }),
    dateTime: (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    kindName: (kind: ActivityKind) => t(`training.kind.${kind}`),
  };
}

/** Peso de la persona (kg): el de la ficha médica "Yo"; null si no lo cargó. */
export function useBodyWeight(): number | null {
  const profiles = useMedical((s) => s.profiles);
  const me = [...profiles.values()].find((p) => p.isMe);
  return me?.weightKg && me.weightKg > 0 ? me.weightKg : null;
}

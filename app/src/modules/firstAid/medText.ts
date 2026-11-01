import type { TFunction } from 'i18next';
import type { Medication } from '@/core/model/types';
import { medTimes } from './medicalStore';

/** "Cada 8 h: 08:00 · 16:00 · 00:00", "1 vez por día: 08:00", "Solo si hace falta". */
export function medScheduleText(m: Medication, t: TFunction): string {
  if (m.everyHours === null || m.everyHours === undefined) return '';
  const times = medTimes(m.everyHours, m.firstTime);
  const freq = t(`medical.freq.${m.everyHours}`);
  return times.length ? `${freq}: ${times.join(' · ')}` : freq;
}

/** Teléfono dentro de un texto libre ("María (hermana) 11 5555-1234"). */
export function phoneIn(text: string): string | null {
  return text.match(/\+?\d[\d\s().-]{5,}\d/)?.[0] ?? null;
}

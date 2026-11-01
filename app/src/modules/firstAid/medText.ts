import type { TFunction } from 'i18next';
import type { Id, Medication, MedicalProfile } from '@/core/model/types';
import { medTimes } from './medicalStore';

/** "Cada 8 h: 08:00 · 16:00 · 00:00", "1 vez por día: 08:00", "Solo si hace falta". */
export function medScheduleText(m: Medication, t: TFunction): string {
  if (m.everyHours === null || m.everyHours === undefined) return '';
  const times = medTimes(m.everyHours, m.firstTime);
  const freq = t(`medical.freq.${m.everyHours}`);
  return times.length ? `${freq}: ${times.join(' · ')}` : freq;
}

/** Todo en una línea: "Levotiroxina 50 mcg · Cada 8 h: 08:00 · 16:00 · 00:00 · en ayunas". */
export function medLine(m: Medication, t: TFunction): string {
  return [[m.name, m.dose].filter(Boolean).join(' '), medScheduleText(m, t), m.schedule].filter(Boolean).join(' · ');
}

/** Contactos de emergencia de una ficha, listos para mostrar: de otra ficha se leen nombre, parentesco y teléfono actuales. */
export function resolveEmergencyContacts(p: MedicalProfile, profiles: Map<Id, MedicalProfile>): { label: string; phone: string | null }[] {
  return (p.emergencyContacts ?? []).flatMap((c) => {
    if (c.profileId) {
      const other = profiles.get(c.profileId);
      return other ? [{ label: [other.name, other.relationship && `(${other.relationship})`].filter(Boolean).join(' '), phone: other.phone || null }] : [];
    }
    return [{ label: c.text, phone: phoneIn(c.text) }];
  });
}

/** Teléfono dentro de un texto libre ("María (hermana) 11 5555-1234"). */
export function phoneIn(text: string): string | null {
  return text.match(/\+?\d[\d\s().-]{5,}\d/)?.[0] ?? null;
}

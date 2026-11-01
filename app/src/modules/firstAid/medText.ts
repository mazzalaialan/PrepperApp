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

export interface FichaContact {
  /** Lo que se escribió en la ficha ("Dr. Pérez, OSDE 4555-1234"). */
  text: string;
  phone: string;
  /** "Médico de Ana", "Contacto de emergencia de Tomi"… */
  roles: string[];
}

/**
 * Teléfonos que hay en las fichas médicas y no son de una persona con ficha:
 * médicos, veterinarios y contactos de emergencia escritos a mano. Un mismo
 * teléfono aparece una sola vez, con todos sus roles.
 */
export function fichaContacts(profiles: Map<Id, MedicalProfile>, t: TFunction): FichaContact[] {
  const byPhone = new Map<string, FichaContact>();
  const add = (text: string, role: string) => {
    const phone = phoneIn(text);
    if (!phone) return;
    const key = phone.replace(/\D/g, '');
    const found = byPhone.get(key);
    if (found) {
      if (!found.roles.includes(role)) found.roles.push(role);
    } else byPhone.set(key, { text: text.trim(), phone, roles: [role] });
  };
  for (const p of profiles.values()) {
    if (p.doctor.trim()) add(p.doctor, t(p.kind === 'pet' ? 'emergency.vetOf' : 'emergency.doctorOf', { name: p.name }));
    for (const c of p.emergencyContacts ?? []) if (!c.profileId && c.text.trim()) add(c.text, t('emergency.emergencyContactOf', { name: p.name }));
  }
  return [...byPhone.values()];
}

/** Teléfono dentro de un texto libre ("María (hermana) 11 5555-1234"). */
export function phoneIn(text: string): string | null {
  return text.match(/\+?\d[\d\s().-]{5,}\d/)?.[0] ?? null;
}

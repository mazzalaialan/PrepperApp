import type { TFunction } from 'i18next';
import type { Doctor, Id, Medication, MedicalProfile } from '@/core/model/types';
import { medTimes, phoneIn } from './medicalStore';

export { phoneIn };

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

/** "Psiquiatra: Dr. Pérez" (o solo el nombre si no tiene especialidad). */
export function doctorLabel(d: { role: string; name: string }): string {
  return [d.role, d.name].filter(Boolean).join(': ');
}

/** "Pediatra de Tomi", "Veterinario de Firulais". */
export function doctorUse(d: Doctor, p: MedicalProfile, t: TFunction): string {
  return t('emergency.doctorOf', { role: d.role || t(p.kind === 'pet' ? 'emergency.vet' : 'emergency.doctor'), name: p.name });
}

/** Para cada médico compartido, en qué fichas está y como qué. */
export function doctorUses(profiles: Map<Id, MedicalProfile>, t: TFunction): Map<Id, string[]> {
  const uses = new Map<Id, string[]>();
  for (const p of profiles.values()) {
    for (const d of p.doctors ?? []) if (d.contactId) uses.set(d.contactId, [...(uses.get(d.contactId) ?? []), doctorUse(d, p, t)]);
  }
  return uses;
}

export interface FichaContact {
  /** Quién es ("Psiquiatra: Dr. Pérez", "Escuela 4222-3333"). */
  text: string;
  phone: string;
  /** "Médico de Ana", "Contacto de emergencia de Tomi"… */
  roles: string[];
}

/**
 * Teléfonos que hay en las fichas médicas y no son de una persona con ficha:
 * médicos, veterinarios, emergencias de la obra social y contactos de emergencia
 * escritos a mano. Un mismo teléfono aparece una sola vez, con todos sus roles.
 */
export function fichaContacts(profiles: Map<Id, MedicalProfile>, t: TFunction): FichaContact[] {
  const byPhone = new Map<string, FichaContact>();
  const add = (text: string, phone: string | null, role: string) => {
    if (!phone?.trim()) return;
    const key = phone.replace(/\D/g, '');
    const found = byPhone.get(key);
    if (found) {
      if (!found.roles.includes(role)) found.roles.push(role);
    } else byPhone.set(key, { text: text.trim(), phone: phone.trim(), roles: [role] });
  };
  for (const p of profiles.values()) {
    // Los médicos compartidos están en los contactos guardados; acá solo los que no se guardaron todavía.
    for (const d of p.doctors ?? []) {
      if (d.contactId) continue;
      add(doctorLabel(d) || d.phone, d.phone, doctorUse(d, p, t));
    }
    if (p.kind !== 'pet') {
      const ins = p.insurance;
      if (ins?.emergencyPhone.trim()) {
        add(t('emergency.insuranceEmergency', { name: ins.name || t('medical.insurance.title') }), ins.emergencyPhone, t('emergency.insuranceOf', { name: p.name }));
      }
    }
    for (const c of p.emergencyContacts ?? []) if (!c.profileId && c.text.trim()) add(c.text, phoneIn(c.text), t('emergency.emergencyContactOf', { name: p.name }));
  }
  return [...byPhone.values()];
}

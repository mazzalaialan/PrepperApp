import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id, MedicalProfile, PersonalDocument } from '@/core/model/types';
import { useMedical } from '@/modules/firstAid/medicalStore';

export interface OwnerOption {
  id: Id;
  label: string;
}

/** "Yo (Ana)", "Juan (Hijo)", "Firulais (mascota)". */
export function ownerLabel(p: MedicalProfile, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (p.isMe) return t('documents.ownerMe', { name: p.name });
  if (p.kind === 'pet') return t('documents.ownerPet', { name: p.name });
  return p.relationship ? `${p.name} (${p.relationship})` : p.name;
}

/** Yo primero, después personas y al final mascotas; dentro de cada uno, por nombre. */
export function compareOwners(a: MedicalProfile, b: MedicalProfile, locale: string): number {
  return Number(!!b.isMe) - Number(!!a.isMe) || Number(a.kind === 'pet') - Number(b.kind === 'pet') || a.name.localeCompare(b.name, locale);
}

export interface DocumentGroup {
  /** Ficha médica dueña del grupo; null = generales. */
  profile: MedicalProfile | null;
  docs: PersonalDocument[];
}

/**
 * Generales primero y después uno por persona o mascota. Dentro de cada grupo,
 * el orden elegido por el usuario; los que nunca se ordenaron, al final por título.
 */
export function groupDocuments(docs: PersonalDocument[], profiles: Map<Id, MedicalProfile>, locale: string): DocumentGroup[] {
  const byOwner = new Map<Id | null, PersonalDocument[]>();
  for (const d of docs) {
    const key = d.profileId && profiles.has(d.profileId) ? d.profileId : null;
    byOwner.set(key, [...(byOwner.get(key) ?? []), d]);
  }
  const sortDocs = (list: PersonalDocument[]) =>
    [...list].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title, locale));
  const groups: DocumentGroup[] = [];
  if (byOwner.has(null)) groups.push({ profile: null, docs: sortDocs(byOwner.get(null)!) });
  const owners = [...byOwner.keys()].flatMap((id) => (id ? [profiles.get(id)!] : [])).sort((a, b) => compareOwners(a, b, locale));
  for (const p of owners) groups.push({ profile: p, docs: sortDocs(byOwner.get(p.id)!) });
  return groups;
}

/** Las fichas médicas a las que se puede asociar un documento: yo primero, después personas y mascotas. */
export function useOwnerOptions(): OwnerOption[] {
  const { t, i18n } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  return useMemo(
    () =>
      [...profiles.values()]
        .sort((a, b) => compareOwners(a, b, i18n.language))
        .map((p) => ({ id: p.id, label: ownerLabel(p, t) })),
    [profiles, t, i18n.language],
  );
}

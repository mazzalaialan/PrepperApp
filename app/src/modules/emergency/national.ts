import type { ContactKind } from '@/core/model/types';
import type { Country } from '@/core/settings/settings';

/**
 * Números de emergencia por país. El texto de cada uno está en los idiomas
 * (`emergency.national.<id>`).
 *
 * - Argentina: argentina.gob.ar/tema/emergencias, Centro Nacional de
 *   Intoxicaciones, Red de Toxicología y Hospital de Quemados de la Ciudad de
 *   Buenos Aires, Línea de Salud Mental del Ministerio de Salud.
 * - Chile: SAMU, Bomberos, Carabineros, PDI y Armada; CITUC (Centro de
 *   Información Toxicológica UC); *4141 del Ministerio de Salud.
 * - Uruguay: 911 (todas las emergencias), Bomberos, Prefectura; CIAT (Hospital
 *   de Clínicas); Línea Vida (ASSE) y la línea de violencia doméstica (Inmujeres).
 */
export interface NationalNumber {
  id: string;
  number: string;
  kind: ContactKind;
}

export const NATIONAL_NUMBERS: Record<Country, NationalNumber[]> = {
  AR: [
    { id: 'emergencies', number: '911', kind: 'police' },
    { id: 'same', number: '107', kind: 'medical' },
    { id: 'fire', number: '100', kind: 'fire' },
    { id: 'civilDefense', number: '103', kind: 'civilDefense' },
    { id: 'nautical', number: '106', kind: 'other' },
    { id: 'environmental', number: '105', kind: 'other' },
    { id: 'poison', number: '0800-333-0160', kind: 'medical' },
    { id: 'poisonKids', number: '0800-444-8694', kind: 'medical' },
    { id: 'burns', number: '011 4923-4082', kind: 'hospital' },
    { id: 'mentalHealth', number: '0800-999-0091', kind: 'medical' },
    { id: 'gender', number: '144', kind: 'other' },
  ],
  CL: [
    { id: 'clSamu', number: '131', kind: 'medical' },
    { id: 'clCarabineros', number: '133', kind: 'police' },
    { id: 'clFire', number: '132', kind: 'fire' },
    { id: 'clPdi', number: '134', kind: 'police' },
    { id: 'clMaritime', number: '137', kind: 'other' },
    { id: 'clPoison', number: '+56 2 2635 3800', kind: 'medical' },
    { id: 'clMentalHealth', number: '*4141', kind: 'medical' },
  ],
  UY: [
    { id: 'uyEmergencies', number: '911', kind: 'police' },
    { id: 'uyFire', number: '104', kind: 'fire' },
    { id: 'uyPrefectura', number: '106', kind: 'other' },
    { id: 'uyPoison', number: '1722', kind: 'medical' },
    { id: 'uyMentalHealth', number: '0800 0767', kind: 'medical' },
    { id: 'uyGender', number: '0800 4141', kind: 'other' },
  ],
};

/** Número para marcar: solo dígitos, "+" y "*" ("*4141"), y del primero si vienen varios ("0336-5408830/36"). */
export function dialable(phone: string): string {
  const first = phone.split(/[/,;]| o | y /)[0] ?? '';
  return first.replace(/[^\d+*#]/g, '');
}

/** Link a Google Maps: por dirección si la hay (más reconocible), si no por coordenadas. */
export function mapsUrl(address: string, lat: number | null, lon: number | null): string | null {
  const query = address.trim() || (lat !== null && lon !== null ? `${lat.toFixed(6)},${lon.toFixed(6)}` : '');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

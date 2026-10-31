import type { ContactKind } from '@/core/model/types';

/**
 * Números nacionales de emergencia de la Argentina (argentina.gob.ar/tema/emergencias
 * y Centro Nacional de Intoxicaciones). El texto de cada uno está en los
 * idiomas (`emergency.national.<id>`).
 */
export interface NationalNumber {
  id: string;
  number: string;
  kind: ContactKind;
}

export const NATIONAL_NUMBERS: NationalNumber[] = [
  { id: 'emergencies', number: '911', kind: 'police' },
  { id: 'same', number: '107', kind: 'medical' },
  { id: 'fire', number: '100', kind: 'fire' },
  { id: 'civilDefense', number: '103', kind: 'civilDefense' },
  { id: 'nautical', number: '106', kind: 'other' },
  { id: 'environmental', number: '105', kind: 'other' },
  { id: 'poison', number: '0800-333-0160', kind: 'medical' },
  { id: 'gender', number: '144', kind: 'other' },
];

/** Número para marcar: solo dígitos y "+", y del primero si vienen varios ("0336-5408830/36"). */
export function dialable(phone: string): string {
  const first = phone.split(/[/,;]| o | y /)[0] ?? '';
  return first.replace(/[^\d+]/g, '');
}

/** Link a Google Maps: por dirección si la hay (más reconocible), si no por coordenadas. */
export function mapsUrl(address: string, lat: number | null, lon: number | null): string | null {
  const query = address.trim() || (lat !== null && lon !== null ? `${lat.toFixed(6)},${lon.toFixed(6)}` : '');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

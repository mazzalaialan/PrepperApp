import { beforeAll, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import { forSpeech } from '@/core/speech/speech';
import { kmAnnouncement, spokenDuration } from './kmSpeech';

let tEs: (key: string, o?: Record<string, unknown>) => string;
let tEn: (key: string, o?: Record<string, unknown>) => string;

beforeAll(async () => {
  await i18n.init({ resources: { es: { translation: es }, en: { translation: en } }, lng: 'es', fallbackLng: 'es', interpolation: { escapeValue: false } });
  tEs = i18n.getFixedT('es');
  tEn = i18n.getFixedT('en');
});

describe('voz de los kilómetros', () => {
  it('la duración se dice con palabras, sin «10:40» (se leería como una hora)', () => {
    expect(spokenDuration(640, tEs)).toBe('10 minutos 40 segundos');
    expect(spokenDuration(3800, tEs)).toBe('1 hora 3 minutos 20 segundos');
    expect(spokenDuration(60, tEs)).toBe('1 minuto');
    expect(spokenDuration(45, tEn)).toBe('45 seconds');
    expect(spokenDuration(0, tEs)).toBe('0 segundos');
  });

  it('el anuncio del kilómetro lleva el tiempo y el ritmo en palabras y ningún «:»', () => {
    const text = kmAnnouncement(3, 1085, 358, tEs);
    expect(text).toBe('Kilómetro 3. Tiempo 18 minutos 5 segundos. Ritmo 5 minutos 58 segundos por kilómetro.');
    expect(text).not.toContain(':');
    expect(kmAnnouncement(1, 400, undefined, tEs)).toBe('Kilómetro 1. Tiempo 6 minutos 40 segundos.');
    expect(kmAnnouncement(2, 700, 350, tEn)).toBe('Kilometer 2. Time 11 minutes 40 seconds. Pace 5 minutes 50 seconds per kilometer.');
  });

  it('la voz nunca recibe «:»: no dice «dos puntos» ni lee 10:40 como una hora', () => {
    expect(forSpeech('Ritmo 10:40 por kilómetro')).toBe('Ritmo 10 40 por kilómetro');
    expect(forSpeech('Atención: salí del agua')).toBe('Atención, salí del agua');
    expect(forSpeech('Paso 2 : abrí la vía aérea')).toBe('Paso 2, abrí la vía aérea');
    expect(forSpeech('Ya: 1:05:09')).toBe('Ya, 1 05 09');
    expect(forSpeech('sin dos puntos')).toBe('sin dos puntos');
    for (const s of ['a:b', ': hola', 'x::y', '12:30 h']) expect(forSpeech(s)).not.toContain(':');
  });
});

import { describe, expect, it } from 'vitest';
import { pickVoice } from './speech';

const v = (lang: string, localService: boolean, name = lang) => ({ lang, localService, name, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe('voz para leer las guías', () => {
  it('prefiere las voces sin conexión y, en español, la de Argentina', () => {
    const voices = [v('en-US', true), v('es-ES', true), v('es-AR', false, 'online'), v('es_AR', true, 'local'), v('es-MX', true)];
    expect(pickVoice(voices, 'es')!.name).toBe('local');
    expect(pickVoice([v('es-ES', true), v('es-AR', false)], 'es')!.lang).toBe('es-ES');
    expect(pickVoice(voices, 'en')!.lang).toBe('en-US');
  });

  it('sin voz para el idioma no hay lectura', () => {
    expect(pickVoice([v('en-US', true)], 'es')).toBeNull();
  });
});

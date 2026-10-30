import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import type { Language } from '@/core/settings/settings';

export function initI18n(language: Language): Promise<unknown> {
  return i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng: language,
    fallbackLng: 'es',
    interpolation: { escapeValue: false }, // React ya escapa
  });
}

export function setLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  document.documentElement.lang = language;
}

export { i18n };

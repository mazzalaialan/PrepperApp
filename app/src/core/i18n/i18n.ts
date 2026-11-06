import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '@/locales/es.json';
import type { Language } from '@/core/settings/settings';

/** El español viene siempre (es el respaldo); el inglés se carga recién si se elige (unos 125 KB menos al arrancar). */
async function loadEnglish(): Promise<void> {
  if (i18n.hasResourceBundle('en', 'translation')) return;
  const en = (await import('@/locales/en.json')).default;
  i18n.addResourceBundle('en', 'translation', en);
}

export async function initI18n(language: Language): Promise<unknown> {
  const done = i18n.use(initReactI18next).init({
    resources: { es: { translation: es } },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false }, // React ya escapa
  });
  await done;
  if (language === 'en') {
    await loadEnglish();
    await i18n.changeLanguage('en');
  }
  return done;
}

export function setLanguage(language: Language): void {
  document.documentElement.lang = language;
  if (language === 'en') void loadEnglish().then(() => i18n.changeLanguage('en'));
  else void i18n.changeLanguage(language);
}

export { i18n };

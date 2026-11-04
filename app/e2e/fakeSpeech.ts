import type { Page } from '@playwright/test';

/**
 * Voz simulada: Chromium sin ventana no trae voces. Anota lo leído en
 * `window.__spoken` y las cancelaciones en `window.__cancels`; "habla" hasta
 * que se cancela. Además, los botones de llamar no abren el marcador.
 */
export async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[]; __cancels: number };
    w.__spoken = [];
    w.__cancels = 0;
    let speaking = false;
    const voice = { lang: 'es-AR', localService: true, name: 'Prueba', default: true, voiceURI: 'prueba' };
    class FakeUtterance {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [voice],
        speak: (u: FakeUtterance) => {
          speaking = true;
          w.__spoken.push(u.text);
        },
        cancel: () => {
          speaking = false;
          w.__cancels++;
        },
        get speaking() {
          return speaking;
        },
        pending: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    document.addEventListener('click', (e) => (e.target as Element).closest?.('a[href^="tel:"]') && e.preventDefault());
  });
}

export const spokenLines = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
export const cancelCount = (page: Page) => page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);

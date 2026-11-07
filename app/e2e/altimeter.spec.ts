import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

/**
 * GPS simulado con altura: Playwright no deja fijar la altitud, así que se
 * reemplaza `watchPosition` y se emite una lectura cada 200 ms con `__alt`.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __alt: number };
    w.__alt = 1000;
    let next = 1;
    const timers = new Map<number, ReturnType<typeof setInterval>>();
    navigator.geolocation.watchPosition = (ok) => {
      const id = next++;
      const emit = () =>
        ok({
          coords: { latitude: -41.13, longitude: -71.4, accuracy: 8, altitude: w.__alt, altitudeAccuracy: 12, heading: null, speed: null },
          timestamp: Date.now(),
        } as GeolocationPosition);
      emit();
      timers.set(id, setInterval(emit, 200));
      return id;
    };
    navigator.geolocation.clearWatch = (id) => {
      clearInterval(timers.get(id));
      timers.delete(id);
    };
  });
});

const setAlt = (page: Page, alt: number) => page.evaluate((a) => ((window as unknown as { __alt: number }).__alt = a), alt);

test('altímetro: aclaración, calibrar con altura conocida, subida y alarma', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Altímetro/ }).click();
  await expect(page.getByRole('heading', { name: 'Altímetro' })).toBeVisible();

  // La aclaración de que no es 100% preciso, arriba de todo.
  await expect(page.getByTestId('alt-disclaimer')).toContainText('no es 100% preciso');

  // Altura del GPS, sin calibrar, con su margen.
  await expect(page.getByTestId('alt-value')).toHaveText('1000 m');
  await expect(page.getByTestId('alt-calibration')).toHaveText('±12 m según el GPS · Sin calibrar');

  // Calibrar con una altura conocida: el GPS marca 1000 y el cartel dice 980.
  await page.getByLabel('Altura conocida donde estás (m)').fill('980');
  await page.getByRole('button', { name: 'Calibrar con esta altura' }).click();
  await expect(page.getByTestId('alt-value')).toHaveText('980 m');
  await expect(page.getByTestId('alt-calibration')).toContainText('Calibrado con una altura conocida (−20 m)');

  // Alarma al llegar a 1030 m (subiendo).
  await page.getByLabel('Altura (m)').fill('1030');
  await page.getByRole('button', { name: 'Poner la alarma' }).click();
  await expect(page.getByTestId('alt-alarm-active')).toHaveText('Va a sonar al subir a 1030 m.');

  // Ruido de pocos metros: no suma subida ni dispara la alarma.
  await setAlt(page, 1006);
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId('alt-ascent')).toHaveText('Subida: 0 m');
  await expect(page.getByTestId('alt-ringing')).toHaveCount(0);

  // Sube 60 m: cuenta la subida y suena la alarma.
  await setAlt(page, 1060);
  await expect(page.getByTestId('alt-value')).toHaveText('1040 m');
  await expect(page.getByTestId('alt-ascent')).toHaveText('Subida: 60 m');
  await expect(page.getByTestId('alt-ringing')).toContainText('Llegaste a la altura de la alarma');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-75-altimeter.png`, fullPage: true });
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('alt-ringing')).toHaveCount(0);

  // Empezar de nuevo pone el desnivel en cero.
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect(page.getByTestId('alt-ascent')).toHaveText('Subida: 0 m');
});

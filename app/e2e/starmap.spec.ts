import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

/** Cuántos píxeles "encendidos" (estrellas, líneas) tiene el canvas: si está vacío, algo falló. */
const litPixels = (page: Page) =>
  page.getByTestId('sky-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 200) n++;
    return n;
  });

test('mapa estelar: cielo completo, guía al Sur, búsqueda, hora y rojo nocturno', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Mapa estelar/ }).click();
  await expect(page.getByTestId('sky-canvas')).toBeVisible();

  // Una noche de otoño en Buenos Aires: la Cruz del Sur alta en el cielo.
  await page.getByLabel('Fecha y hora').fill('2026-05-15T22:00');
  await expect(page.getByLabel('Guía para encontrar el Sur')).toBeChecked();
  await expect(page.getByText(/Prolongá el eje largo de la Cruz del Sur/)).toBeVisible();
  expect(await litPixels(page)).toBeGreaterThan(500);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-19-starmap-dome.png`, fullPage: true });

  // Buscar un astro.
  await page.getByLabel('Buscar un astro').fill('Cruz del Sur');
  await expect(page.getByTestId('sky-target')).toHaveText(/^Cruz del Sur: acimut \d+° \((S|SE|SO)\), altura \d+°$/);
  await page.getByLabel('Buscar un astro').fill('Sol');
  await expect(page.getByTestId('sky-target')).toHaveText('Sol está debajo del horizonte en este momento.');

  // Cambiar la hora: "Ahora" vuelve al cielo actual.
  await page.getByRole('button', { name: '+1 h' }).click();
  await expect(page.getByLabel('Fecha y hora')).toHaveValue('2026-05-15T23:00');
  await page.getByRole('button', { name: 'Ahora', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ahora', exact: true })).toBeDisabled();

  // Rojo nocturno: cambia el tema de toda la app y se puede volver.
  await page.getByLabel('Rojo nocturno (no encandila)').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await page.getByLabel('Rojo nocturno (no encandila)').uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mapa estelar: apuntar al cielo con la brújula del celular', async ({ page }, testInfo) => {
  // Sensor simulado: celular parado mirando hacia el sur (con la declinación de Buenos Aires, ~10° O).
  await page.addInitScript(() => {
    setInterval(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 170, beta: 110, gamma: 0, absolute: true }));
    }, 30);
  });
  await setup(page);
  await page.goto('/#/orientation/starmap');
  await page.getByLabel('Fecha y hora').fill('2026-05-15T22:00');
  await page.getByRole('button', { name: 'Apuntar al cielo' }).click();
  await expect(page.getByTestId('sky-hint')).toHaveText(/Levantá el celular hacia el cielo/);
  // Mirando al sur verdadero (~180°), 20° por encima del horizonte.
  await expect(page.getByTestId('sky-pointing')).toHaveText(/^Mirando a 1(79|80|81)° \(S\), 20° sobre el horizonte$/);
  await page.waitForTimeout(500);
  expect(await litPixels(page)).toBeGreaterThan(200);
  await page.getByLabel('Buscar un astro').fill('Acrux');
  await expect(page.getByTestId('sky-target')).toHaveText(/^Acrux: acimut/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-20-starmap-camera.png`, fullPage: true });
});

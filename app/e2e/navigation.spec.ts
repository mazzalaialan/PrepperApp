import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

test('Navegación: mareas sin conexión de la estación más cercana, con el aviso fijo y la fuente', async ({ page, context }, testInfo) => {
  // Puerto Madryn.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -42.77, longitude: -65.04, accuracy: 20 });
  await start(page);
  // Aparece en Orientación.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Orientación', exact: true }).first().click();
  await page.getByRole('link', { name: /Navegación/ }).click();
  await expect(page.getByRole('heading', { name: 'Navegación' })).toBeVisible();
  await expect(page.getByTestId('navigation-notice')).toContainText('No reemplaza las cartas náuticas');
  await expect(page.getByTestId('tide-station')).toContainText('Puerto Madryn', { timeout: 15_000 });
  await expect(page.getByTestId('tide-far')).toHaveCount(0);
  await expect(page.getByTestId('tide-estuary')).toHaveCount(0);
  await expect(page.getByTestId('tide-now')).toContainText(/Ahora [+−-]\d,\d\d m \((subiendo|bajando)\)/);
  await expect(page.getByTestId('tide-chart')).toBeVisible();
  expect(await page.getByTestId('tide-extremes').locator('li').count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId('tide-extremes')).toContainText('Pleamar');
  await expect(page.getByTestId('tide-extremes')).toContainText('Bajamar');
  await expect(page.getByTestId('tide-source')).toContainText('CC BY 4.0');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-96-navigation-tides.png`, fullPage: true });

  // Sin conexión funciona igual (se calcula en el teléfono con los datos ya guardados): se sale y se vuelve a entrar.
  await context.setOffline(true);
  await page.goto('/#/orientation');
  await page.goto('/#/orientation/navigation');
  await expect(page.getByTestId('tide-station')).toContainText('Puerto Madryn', { timeout: 15_000 });
  await expect(page.getByTestId('tide-chart')).toBeVisible();
});

test('Navegación: sin estación cerca (Montevideo) se avisa que la marea puede ser muy distinta', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.9, longitude: -56.2, accuracy: 20 });
  await start(page);
  await page.goto('/#/orientation/navigation');
  await expect(page.getByTestId('tide-station')).toContainText('Buenos Aires', { timeout: 15_000 });
  await expect(page.getByTestId('tide-far')).toContainText('puede ser muy distinta');
  await expect(page.getByTestId('tide-estuary')).toContainText('el viento y el caudal');
  // Se puede elegir otra de las estaciones cercanas.
  const chips = page.getByTestId('tide-stations').getByRole('button');
  await expect(chips).toHaveCount(3);
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('Navegación: niveles de los ríos del INA con su estado, y sin conexión los últimos guardados', async ({ page, context }, testInfo) => {
  // Buenos Aires: el INA responde (simulado) con el río sobre el nivel de alerta (3,30 m) y 0,5 m más que ayer.
  await context.route('https://alerta.ina.gob.ar/**', async (route) => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    await route.fulfill({
      json: [
        { series_id: 85, timestart: iso(now - 26 * 3_600_000), valor: 3.0 },
        { series_id: 85, timestart: iso(now - 2 * 3_600_000), valor: 3.5 },
      ],
    });
  });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.56, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/orientation/navigation');
  const row = page.getByTestId('river-85');
  await expect(row).toContainText('Buenos Aires', { timeout: 15_000 });
  await expect(row).toContainText('Río de la Plata');
  await expect(row).toContainText('Alerta 3,30 m');
  await expect(row).toContainText('Evacuación 3,90 m');
  await expect(page.getByTestId('river-state-85')).toHaveText('Alerta');
  await expect(row).toContainText('3,50 m');
  await expect(row).toContainText('+0,50 m en 24 h');
  await expect(row).toContainText('medido hace 2 h');
  await expect(page.getByTestId('rivers-source')).toContainText('INA');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-97-navigation-rivers.png`, fullPage: true });

  // Sin conexión: se ve el último nivel guardado y el aviso.
  await context.setOffline(true);
  await page.goto('/#/orientation');
  await page.goto('/#/orientation/navigation');
  await expect(page.getByTestId('rivers-offline')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('river-85')).toContainText('3,50 m');
  await expect(page.getByTestId('river-state-85')).toHaveText('Alerta');
});

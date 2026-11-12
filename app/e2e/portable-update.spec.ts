import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
/** Versión de la app que se está probando (la de package.json). */
const CURRENT = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

test('paquete portable: avisa versión nueva, se puede cerrar y buscar a mano', async ({ page, context }) => {
  // Simula el paquete portable (trae portable.json) y una Release más nueva en GitHub.
  await context.route('**/portable.json', (route) => route.fulfill({ json: { portable: true } }));
  let latest = '9.9.9';
  let calls = 0;
  await context.route('https://api.github.com/repos/mazzalaialan/SurvTools/releases/latest', (route) => {
    calls++;
    return route.fulfill({
      json: {
        tag_name: `v${latest}`,
        html_url: 'https://github.com/mazzalaialan/SurvTools/releases/latest',
        assets: [{ name: `vikarg-survival-portable-${latest}.zip`, browser_download_url: `https://example.org/vikarg-survival-portable-${latest}.zip` }],
      },
    });
  });

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  const notice = page.locator('.update-notice');
  await expect(notice.getByRole('link', { name: 'Hay una versión nueva del paquete portable: 9.9.9' })).toHaveAttribute(
    'href',
    'https://example.org/vikarg-survival-portable-9.9.9.zip',
  );
  await notice.getByRole('button', { name: 'Cerrar' }).click();
  await expect(notice).toHaveCount(0);

  // Cerrado: no vuelve al recargar (se revisa una vez por día).
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(calls).toBe(1);

  // En Ajustes se puede buscar a mano.
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByText(/Estás usando el paquete portable/)).toBeVisible();
  latest = CURRENT;
  await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
  await expect(page.getByTestId('portable-status')).toHaveText('Tenés la última versión.');
});

test('la versión de internet no muestra nada del paquete portable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Acerca de' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buscar actualizaciones' })).toHaveCount(0);
});

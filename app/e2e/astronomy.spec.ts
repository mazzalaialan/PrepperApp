import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

test('sol y luna: horarios del día, cambio de fecha y coordenadas a mano', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Sol y luna/ }).click();
  await expect(page.getByLabel('Lugar')).toHaveValue('gps');
  await page.getByLabel('Fecha').fill('2026-10-30');
  await expect(page.getByTestId('sky-date')).toHaveText('viernes, 30 de octubre');
  await expect(page.getByTestId('sunrise')).toHaveText('05:53');
  await expect(page.getByTestId('sunset')).toHaveText('19:21');
  await expect(page.getByTestId('moon-phase')).toHaveText('Menguante gibosa');
  await expect(page.getByText('Luna llena')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-15-sky.png`, fullPage: true });

  await page.getByRole('button', { name: 'Día siguiente' }).click();
  await expect(page.getByTestId('sky-date')).toHaveText('sábado, 31 de octubre');
  await expect(page.getByTestId('sunrise')).toHaveText('05:52');

  // Ushuaia a mano: amanece mucho antes.
  await page.getByLabel('Lugar').selectOption({ label: 'Escribir coordenadas…' });
  await page.getByLabel('Coordenadas').fill('-54.8019, -68.303');
  await expect(page.getByTestId('sunrise')).toHaveText(/^0[45]:\d\d$/);
});

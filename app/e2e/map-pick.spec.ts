import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('elegir en el mapa: un punto tocado completa las coordenadas (waypoint y lugar)', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Waypoint nuevo: el botón del mapa, al lado del de mi ubicación.
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Punto del mapa');
  await page.getByRole('button', { name: 'Elegir en el mapa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Elegir en el mapa' });
  await expect(dialog.getByTestId('map-pick-hint')).toHaveText('Tocá el mapa en el lugar que querés.');
  const use = dialog.getByRole('button', { name: 'Usar este punto' });
  await expect(use).toBeDisabled();
  const map = dialog.getByTestId('map-pick');
  await expect(map.locator('canvas')).toBeVisible({ timeout: 20_000 });
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10);
  await expect(dialog.getByTestId('map-pick-hint')).toHaveText(/\d+°.*[SN].*\d+°.*[OE]/);
  await use.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Coordenadas')).toHaveValue(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/);
  await expect(page.getByTestId('coords-preview')).toBeVisible();

  // Lugar "coordenadas a mano" (por ejemplo en Sol y luna): el mismo botón, también sin conexión
  // (la app y el diálogo vienen del service worker; sin zonas descargadas se ve el contorno).
  await page.goto('/#/weather/sky');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByLabel('Lugar').selectOption({ label: 'Escribir coordenadas…' });
  await page.getByRole('button', { name: 'Elegir en el mapa' }).click();
  const d2 = page.getByRole('dialog', { name: 'Elegir en el mapa' });
  const m2 = d2.getByTestId('map-pick');
  await expect(m2.locator('canvas')).toBeVisible({ timeout: 20_000 });
  const b2 = (await m2.boundingBox())!;
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await d2.getByRole('button', { name: 'Usar este punto' }).click();
  await expect(page.getByLabel('Coordenadas')).toHaveValue(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/);
});

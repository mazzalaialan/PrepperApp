import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
}

test('configuración inicial, ubicaciones, artículo con lote y alerta', async ({ page }) => {
  await page.goto('/');

  // Bóveda
  await expect(page.getByRole('heading', { name: 'Te damos la bienvenida' })).toBeVisible();
  await shot(page, '01-setup');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();

  await expect(page.getByRole('heading', { name: 'Clave de recuperación' })).toBeVisible();
  await expect(page.locator('.recovery-key')).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
  await shot(page, '02-recovery');
  const continueBtn = page.getByRole('button', { name: 'Continuar' });
  await expect(continueBtn).toBeDisabled();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await continueBtn.click();

  await expect(page.getByText('Las alertas de vencimiento aparecerán acá')).toBeVisible();
  await shot(page, '03-home-empty');

  // Ubicaciones
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Casa');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Agregar sububicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Sótano');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Sótano')).toBeVisible();
  await shot(page, '04-locations');

  // Artículo
  await page.goto('/#/inventory/items');
  await page.getByRole('link', { name: 'Nuevo artículo' }).click();
  await page.getByLabel('Nombre').fill('Atún');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimento' });
  await page.getByLabel('Unidad', { exact: true }).fill('latas');
  await page.getByLabel('Peso por unidad').fill('170');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/#\/inventory\/items\/[0-9a-f-]{36}$/);

  // Lote que vence en 10 días
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ubicación').selectOption({ label: 'Casa › Sótano' });
  await dialog.getByLabel('Cantidad').fill('6');
  await dialog.getByLabel('Fecha de vencimiento').fill(isoInDays(10));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Vence en 10 días')).toBeVisible();
  await shot(page, '05-item');

  // Inicio muestra la alerta
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: '1 alerta' })).toBeVisible();
  await shot(page, '06-home-alert');

  // Bloquear y desbloquear: los datos siguen ahí
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await expect(page.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
  await page.getByLabel('Contraseña').fill('incorrecta-123');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByText('Contraseña incorrecta.')).toBeVisible();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('heading', { name: '1 alerta' })).toBeVisible();

  // Tema rojo nocturno
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Rojo nocturno' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await page.goto('/#/inventory/items');
  await shot(page, '07-items-red');
});

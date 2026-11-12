import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('sin contraseña: entra sola, no se bloquea, el backup pide su contraseña y después se puede poner una', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar sin contraseña' }).click();
  await expect(page.getByTestId('setup-no-password')).toContainText('cualquiera que tenga este dispositivo desbloqueado');
  await page.getByRole('button', { name: 'Entendido, usar sin contraseña' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // Sin botón de bloqueo.
  await expect(page.locator('.topbar-lock')).toHaveCount(0);

  // Al volver a abrir la app, entra sola.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Backup: hay que elegir una contraseña para el archivo.
  await page.goto('/#/settings/backup');
  await expect(page.getByTestId('backup-password')).toBeVisible();
  const exportBtn = page.getByRole('button', { name: 'Exportar backup' });
  await expect(exportBtn).toBeDisabled();
  await page.getByTestId('backup-password').getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByTestId('backup-password').getByLabel('Repetir contraseña').fill(PASSWORD);
  await expect(exportBtn).toBeEnabled();

  // Ajustes: avisa que no hay contraseña y permite poner una (con clave de recuperación nueva).
  await page.goto('/#/settings');
  const security = page.getByTestId('security');
  await expect(security.getByTestId('no-password-status')).toBeVisible();
  await security.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await security.getByLabel('Repetir contraseña').fill(PASSWORD);
  await security.getByRole('button', { name: 'Poner contraseña' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Ahora sí se bloquea y pide la contraseña.
  await page.locator('.topbar-lock').click();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Y se puede volver a quitar (con la contraseña actual).
  await page.goto('/#/settings');
  const remove = page.getByTestId('remove-password');
  await remove.getByLabel('Contraseña actual').fill('mal-mal-mal');
  await remove.getByRole('button', { name: 'Quitar la contraseña' }).click();
  await page.getByRole('button', { name: 'Sí, continuar' }).click();
  await expect(remove.getByRole('alert')).toBeVisible();
  await remove.getByLabel('Contraseña actual').fill(PASSWORD);
  await remove.getByRole('button', { name: 'Quitar la contraseña' }).click();
  await page.getByRole('button', { name: 'Sí, continuar' }).click();
  await expect(page.getByTestId('no-password-status')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
});

test('datos de emergencia en la pantalla de bloqueo: solo si se activan, y al día con la ficha', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/first-aid/medical');
  await page.getByRole('link', { name: 'Nueva ficha' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Grupo sanguíneo').selectOption('0-');
  await page.getByLabel('Alergias').fill('Penicilina');
  await page.getByLabel('Parentesco').fill('Yo');
  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  await page.getByLabel('Nombre y teléfono del contacto 1').fill('Juan (hermano) 11 5555-1234');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);

  // Sin activar: la pantalla de bloqueo no muestra nada.
  await page.locator('.topbar-lock').click();
  await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
  await expect(page.getByTestId('lock-emergency-show')).toHaveCount(0);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();

  await page.goto('/#/settings');
  await page.getByTestId('emergency-on-lock').check();
  // Se guarda la copia (con un pequeño retraso) y se bloquea.
  await page.waitForTimeout(1200);
  await page.locator('.topbar-lock').click();
  await page.getByTestId('lock-emergency-show').click();
  const card = page.getByTestId('emergency-card');
  await expect(card.getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911');
  await expect(card).toContainText('Ana');
  await expect(card).toContainText('0-');
  await expect(card).toContainText('Penicilina');
  await expect(card.getByRole('link', { name: '11 5555-1234' })).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${test.info().project.name}-lock-emergency.png`, fullPage: true });

  // Al desactivarla, se borra.
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/settings');
  await page.getByTestId('emergency-on-lock').uncheck();
  await page.waitForTimeout(300);
  await page.locator('.topbar-lock').click();
  await expect(page.getByTestId('lock-emergency-show')).toHaveCount(0);
});

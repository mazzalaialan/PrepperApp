import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const SERVER = 'http://127.0.0.1:8099';

async function createVault(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test('transferir a un dispositivo nuevo con el QR (link) y código de un solo uso', async ({ page, browser }, testInfo) => {
  await createVault(page);

  // Configurar y probar el servidor
  await page.goto('/#/settings');
  await page.getByLabel('Servidor VikArg').fill(`${SERVER}/`);
  await page.getByRole('button', { name: 'Probar conexión' }).click();
  await expect(page.getByText(/Servidor VikArg .* disponible/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).last().click();

  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Botiquín de auto');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/items\/[0-9a-f-]{36}$/);

  // Enviar
  await page.goto('/#/inventory/backup');
  await page.getByRole('button', { name: 'Generar código' }).click();
  const codeText = await page.getByLabel('Código de transferencia').textContent();
  expect(codeText).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(page.getByRole('img', { name: 'QR de transferencia' })).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-09-transfer.png`, fullPage: true });
  const code = codeText!.replace('-', '');

  // Dispositivo nuevo que escanea el QR: abre el link directo en la pantalla de restaurar.
  const ctxB = await browser.newContext({ ...testInfo.project.use });
  const b = await ctxB.newPage();
  await b.goto(`/#/transfer?server=${encodeURIComponent(SERVER)}&code=${code}`);
  await b.getByLabel('Contraseña que tenías al exportarlo').fill(PASSWORD);
  await b.getByRole('button', { name: 'Restaurar' }).click();
  await expect(b).toHaveURL(/#\/$/);
  await expect(b.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await b.goto('/#/inventory/items');
  await expect(b.getByText('Botiquín de auto')).toBeVisible();
  await ctxB.close();

  // El código ya se usó: un tercer dispositivo no lo puede reutilizar.
  const ctxC = await browser.newContext({ ...testInfo.project.use });
  const c = await ctxC.newPage();
  await c.goto('/');
  await c.getByRole('button', { name: '¿Ya tenés un backup? Restaurarlo' }).click();
  await c.getByRole('button', { name: 'Código' }).click();
  await c.getByLabel('Servidor VikArg').fill(SERVER);
  await c.getByLabel('Código de transferencia').fill(codeText!.toLowerCase());
  await c.getByRole('button', { name: 'Recibir' }).click();
  await expect(c.getByText('El código no existe, ya se usó o venció.')).toBeVisible();
  await ctxC.close();
});

test('notificaciones sin servidor', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await createVault(page);
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Activar notificaciones' }).click();
  await expect(page.getByText(/Sin servidor: aviso diario aproximado/)).toBeVisible();
  await page.getByRole('button', { name: 'Probar' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.getByRole('button', { name: 'Activar notificaciones' })).toBeVisible();
});

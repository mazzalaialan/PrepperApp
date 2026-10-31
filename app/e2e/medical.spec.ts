import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('ficha médica con alergias y medicación', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.getByRole('link', { name: 'Botiquín' }).click();
  await page.getByRole('link', { name: /Ficha médica/ }).click();
  await page.getByRole('link', { name: 'Nueva ficha' }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await page.getByLabel('Fecha de nacimiento').fill('1990-05-20');
  await page.getByLabel('Grupo sanguíneo').selectOption('0-');
  await page.getByLabel('Alergias').fill('Penicilina');
  await page.getByRole('button', { name: 'Agregar medicamento' }).click();
  await page.getByRole('button', { name: 'Agregar medicamento' }).click();
  await page.getByLabel('Medicamento', { exact: true }).first().fill('Levotiroxina');
  await page.getByLabel('Dosis').first().fill('50 mcg');
  await page.getByLabel('Cuándo').first().fill('en ayunas');
  // El segundo queda vacío: no se guarda.
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('group', { name: /Medicamento \d/ })).toHaveCount(1);

  await page.goto('/#/first-aid/medical');
  await expect(page.getByText('Grupo 0- · 1 medicamento')).toBeVisible();
  await expect(page.getByText('Alergias: Penicilina')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-12-medical.png`, fullPage: true });

  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/first-aid/medical');
  await expect(page.getByText('Alergias: Penicilina')).toBeVisible();
});

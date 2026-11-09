import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('peso: historial, IMC y ficha médica (con y sin ficha propia)', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Sin ficha médica propia: no falla, guarda el historial y avisa.
  await page.goto('/#/training/workouts');
  await page.getByTestId('to-weight').click();
  await expect(page.getByRole('heading', { name: 'Peso', exact: true })).toBeVisible();
  await expect(page.getByTestId('weight-no-profile')).toBeVisible();
  await page.getByLabel('Peso (kg)').fill('82,5');
  await page.getByLabel('Día').fill('2026-10-01');
  await page.getByTestId('weight-save').click();
  await page.getByLabel('Peso (kg)').fill('80');
  await page.getByLabel('Día').fill('2026-11-01');
  await page.getByTestId('weight-save').click();
  await expect(page.getByTestId('weight-current')).toHaveText('80,0 kg');
  await expect(page.getByTestId('weight-list').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('weight-chart')).toBeVisible();

  // IMC: pide la altura; con 180 cm y 80 kg da 24,7 (peso normal).
  await expect(page.getByTestId('weight-bmi')).toContainText('IMC: —');
  await page.getByLabel(/Altura en cm/).fill('180');
  await page.getByTestId('weight-height-save').click();
  await expect(page.getByTestId('weight-bmi')).toContainText('IMC: 24,7 · Peso normal');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-88-weight.png`, fullPage: true });

  // Con ficha propia, el peso más reciente también va a la ficha.
  await page.goto('/#/first-aid/medical/new');
  await page.getByLabel('Nombre', { exact: true }).fill('Yo mismo');
  await page.getByLabel('Parentesco').fill('Yo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await page.goto('/#/training/weight');
  await expect(page.getByTestId('weight-no-profile')).toHaveCount(0);
  await page.getByLabel('Peso (kg)').fill('79,2');
  await page.getByLabel('Día').fill('2026-11-05');
  await page.getByTestId('weight-save').click();
  await expect(page.getByTestId('weight-current')).toHaveText('79,2 kg');
  await page.goto('/#/first-aid/medical');
  await page.getByRole('link', { name: /Yo mismo/ }).first().click();
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByLabel('Peso (kg)')).toHaveValue('79.2');
});

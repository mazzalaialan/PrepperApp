import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('guía de primeros auxilios: lo primero, evaluación paso a paso y entorno', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // En Emergencias, la guía va antes de los botiquines.
  await page.getByRole('link', { name: 'Emergencias' }).click();
  const links = await page.locator('main a').allTextContents();
  const guide = links.findIndex((x) => x.includes('Guías de primeros auxilios'));
  const kits = links.findIndex((x) => x.includes('Botiquines'));
  expect(guide).toBeGreaterThanOrEqual(0);
  expect(guide).toBeLessThan(kits);
  await page.getByRole('link', { name: /Guías de primeros auxilios/ }).click();

  // Primero, el resumen de lo importante.
  await expect(page.getByTestId('guide-first')).toContainText('Protegete');
  await expect(page.getByTestId('guide-first')).toContainText('RCP ya');

  // Evaluación: seguro → responde → sangra mucho → pierna → no para → torniquete.
  await page.getByRole('link', { name: 'Empezar evaluación' }).click();
  const node = page.getByTestId('guide-node');
  await expect(node).toContainText('¿El lugar es seguro?');
  await page.getByRole('button', { name: 'Sí, es seguro' }).click();
  await page.getByRole('button', { name: 'Sí', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, sangra mucho' }).click();
  await expect(page.getByRole('heading', { level: 1 }).last()).toHaveText('Sangrado abundante');
  await expect(node).toContainText('Apretá directo sobre la herida');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '107' })).toHaveAttribute('href', 'tel:107');
  await page.getByRole('button', { name: 'Brazo o pierna' }).click();
  await page.getByRole('button', { name: 'No, sigue saliendo en chorro o empapando' }).click();
  await expect(node).toContainText('Torniquete');
  await expect(node).toContainText('No lo aflojes ni lo saques');

  // Zona agreste: aparecen los pasos de evacuación y el acceso a Mi ubicación.
  await expect(node).not.toContainText('evacuación urgente');
  await page.getByRole('button', { name: 'Zona agreste' }).click();
  await expect(node).toContainText('Es una evacuación urgente');
  await expect(page.getByRole('link', { name: 'Mi ubicación (para el rescate)' })).toBeVisible();

  // Volver deshace el último paso.
  await page.getByRole('button', { name: 'Volver' }).first().click();
  await expect(page.getByRole('button', { name: 'Brazo o pierna' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sí, paró' })).toBeVisible();

  // Buscar una situación: mordedura de serpiente, con el Centro de Intoxicaciones.
  await page.goto('/#/first-aid/guides');
  await expect(page.getByRole('button', { name: 'Zona agreste' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByPlaceholder('Buscar: serpiente, quemadura, infarto…').fill('yarará');
  await expect(page.getByTestId('guide-topics').locator('li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Mordedura de serpiente' }).click();
  await expect(node).toContainText('No hagas torniquete');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '0800-333-0160' })).toBeVisible();
  await expect(node).toContainText('camilla');
});

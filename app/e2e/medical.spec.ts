import sharp from 'sharp';
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

  await page.getByRole('link', { name: 'Emergencias' }).click();
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
  // Cada cuánto y la primera toma: los demás horarios se calculan.
  await page.getByLabel('Cada cuánto').first().selectOption({ label: 'Cada 8 h' });
  await page.getByLabel('Primera toma').first().fill('08:00');
  await expect(page.getByTestId('med-times').first()).toHaveText('Horarios: 08:00 · 16:00 · 00:00');
  await page.getByLabel('Indicaciones').first().fill('en ayunas');
  // "Soy yo": queda como mi ficha.
  await page.getByLabel('Soy yo (esta es mi ficha)').check();
  await page.getByLabel('Contacto de emergencia').fill('Juan (hermano) 11 5555-1234');
  // El segundo queda vacío: no se guarda.
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('group', { name: /Medicamento \d/ })).toHaveCount(1);
  await expect(page.getByLabel('Parentesco')).toHaveValue('Yo');

  // Foto de la persona: se ve en la ficha y como avatar en el listado.
  const photoPath = testInfo.outputPath('ana.png');
  await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 180, g: 140, b: 120 } } }).png().toFile(photoPath);
  await page.getByTestId('person-photo-file').setInputFiles(photoPath);
  await expect(page.getByRole('img', { name: 'Ana' })).toBeVisible();

  await page.goto('/#/first-aid/medical');
  await expect(page.locator('img.avatar')).toBeVisible();
  await expect(page.getByText('Grupo 0- · 1 medicamento')).toBeVisible();
  await expect(page.getByText('Alergias: Penicilina')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-12-medical.png`, fullPage: true });

  // Mis datos, arriba de todo en Contactos de emergencia, para quien me asista.
  await page.goto('/#/first-aid/contacts');
  const me = page.getByTestId('my-data');
  await expect(me).toContainText('Ana');
  await expect(me).toContainText('0-');
  await expect(me).toContainText('Penicilina');
  await expect(me).toContainText('Levotiroxina 50 mcg · Cada 8 h: 08:00 · 16:00 · 00:00 · en ayunas');
  await expect(me.getByRole('link', { name: '11 5555-1234' })).toHaveAttribute('href', 'tel:1155551234');
  await expect(page.getByTestId('family-contacts')).toHaveCount(0);

  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/first-aid/medical');
  await expect(page.getByText('Alergias: Penicilina')).toBeVisible();
  await expect(page.locator('img.avatar')).toBeVisible();
});

test('las personas de las fichas aparecen en contactos de emergencia, con parentesco y edad', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  const add = async (name: string, relationship: string, birth: string, phone: string, show = true) => {
    await page.goto('/#/first-aid/medical/new');
    await page.getByLabel('Nombre').fill(name);
    await page.getByLabel('Parentesco').fill(relationship);
    await page.getByLabel('Teléfono').fill(phone);
    await page.getByLabel('Fecha de nacimiento').fill(birth);
    if (!show) await page.getByLabel('Mostrar en Contactos de emergencia').uncheck();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  };
  const year = new Date().getFullYear();
  await add('Tomi', 'Hijo', `${year - 9}-01-01`, '');
  await add('Juan', 'Hijo', `${year - 30}-01-01`, '11 5555-1234');
  await add('Rosa', 'Vecina', `${year - 70}-01-01`, '11 4444-0000', false);

  await page.goto('/#/first-aid/medical');
  await expect(page.getByText('Hijo · 30 años')).toBeVisible();

  await page.goto('/#/first-aid/contacts');
  const family = page.getByTestId('family-contacts').locator('li');
  await expect(family).toHaveCount(2);
  // Primero el adulto, con su teléfono para llamar.
  await expect(family.nth(0)).toContainText('Juan');
  await expect(family.nth(0)).toContainText('Hijo · 30 años');
  await expect(family.nth(0).getByRole('link', { name: '11 5555-1234' })).toHaveAttribute('href', 'tel:1155551234');
  await expect(family.nth(1)).toContainText('Hijo · 9 años · menor de edad');
  await expect(family.nth(1)).toContainText('Sin teléfono');
  await family.nth(1).getByRole('link', { name: 'Ficha médica de Tomi' }).click();
  await expect(page.getByLabel('Nombre')).toHaveValue('Tomi');
});

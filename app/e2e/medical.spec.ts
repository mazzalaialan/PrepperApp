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
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
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
  // Parentesco "Yo": es mi ficha.
  await page.getByLabel('Parentesco').fill('Yo');
  await expect(page.getByText('Es tu ficha')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  await page.getByLabel('Nombre y teléfono del contacto 1').fill('Juan (hermano) 11 5555-1234');
  // El segundo medicamento queda vacío: no se guarda.
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  // Ya guardado, cada medicamento en una línea; se abre para editarlo.
  await expect(page.getByTestId('med-line')).toHaveText('Levotiroxina 50 mcg · Cada 8 h: 08:00 · 16:00 · 00:00 · en ayunas');
  await expect(page.getByRole('group', { name: /Medicamento \d/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar Levotiroxina' }).click();
  await expect(page.getByRole('group', { name: 'Medicamento 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('med-line')).toHaveCount(1);

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
    // Cambia solo el hash: esperar el formulario nuevo para no escribir sobre la ficha anterior.
    await expect(page.getByRole('heading', { name: 'Nueva ficha' })).toBeVisible();
    await page.getByLabel('Nombre', { exact: true }).fill(name);
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
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Tomi');

  // Contactos de emergencia de Tomi: uno de otra ficha (Juan) y otro escrito a mano.
  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  await page.getByLabel('Contacto de emergencia 1').selectOption({ label: 'Juan (Hijo)' });
  await expect(page.getByText('11 5555-1234')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  await page.getByLabel('Contacto de emergencia 2').selectOption({ label: 'Otra persona (escribir)' });
  await page.getByLabel('Nombre y teléfono del contacto 2').fill('Escuela 4222-3333');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado')).toBeVisible();
  await page.goto('/#/first-aid/contacts');
  const tomiContacts = family.nth(1).getByTestId('family-emergency-contact');
  await expect(tomiContacts).toHaveCount(2);
  await expect(tomiContacts.nth(0)).toContainText('Su contacto: Juan (Hijo)');
  await expect(tomiContacts.nth(0).getByRole('link', { name: '11 5555-1234' })).toHaveAttribute('href', 'tel:1155551234');
  await expect(tomiContacts.nth(1).getByRole('link', { name: '4222-3333' })).toBeVisible();
  await family.nth(1).getByRole('link', { name: 'Ficha médica de Tomi' }).click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Tomi');

  // Documentos de la ficha: se agregan desde ahí, ya asociados y como médicos.
  await page.getByRole('link', { name: 'Agregar documento' }).click();
  await expect(page.getByLabel('Categoría')).toHaveValue('medical');
  await expect(page.getByLabel('De quién es')).toHaveText(/Tomi \(Hijo\)/);
  await page.getByLabel('Título').fill('Carnet de vacunas');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/documents\/[0-9a-f-]{36}\?profile=/);
  await page.getByRole('link', { name: 'Volver' }).click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Tomi');
  await expect(page.getByTestId('profile-documents')).toContainText('Carnet de vacunas');

  // Los generales no aparecen en la ficha; en Documentos van agrupados: generales y familia (por persona).
  for (const title of ['Escritura de la casa', 'Póliza del auto']) {
    await page.goto('/#/documents/new');
    await expect(page.getByRole('heading', { name: 'Nuevo documento' })).toBeVisible();
    await expect(page.getByLabel('De quién es')).toHaveValue('');
    await page.getByLabel('Título').fill(title);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/documents\/[0-9a-f-]{36}$/);
  }
  await page.goto('/#/documents');
  await expect(page.getByRole('heading', { name: 'Generales' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Familia' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tomi (Hijo)' })).toBeVisible();
  const general = page.getByTestId('doc-group-general').locator('li');
  await expect(general.nth(0)).toContainText('Escritura de la casa');

  // Orden propio dentro del grupo, guardado.
  await page.getByRole('button', { name: 'Ordenar' }).click();
  await page.getByRole('button', { name: 'Subir Póliza del auto' }).click();
  await expect(general.nth(0)).toContainText('Póliza del auto');
  await page.getByRole('button', { name: 'Listo' }).click();
  await page.goto('/#/first-aid');
  await page.goto('/#/documents');
  await expect(general.nth(0)).toContainText('Póliza del auto');

  await page.getByRole('button', { name: 'Solo médicos' }).click();
  await expect(page.getByText('Escritura de la casa')).toHaveCount(0);
  await expect(page.getByText('Carnet de vacunas')).toBeVisible();
});

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

  // Otra ficha con parentesco "Yo": la anterior pasa a "Otros".
  await page.goto('/#/first-aid/medical/new');
  await expect(page.getByRole('heading', { name: 'Nueva ficha' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María');
  await page.getByLabel('Parentesco').fill('Yo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await page.goto('/#/first-aid/medical');
  await page.getByRole('link', { name: /^Ana\b(?! María)/ }).click();
  await expect(page.getByLabel('Parentesco')).toHaveValue('Otros');
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
    await page.getByLabel('Teléfono', { exact: true }).fill(phone);
    await page.getByLabel('Fecha de nacimiento').fill(birth);
    if (!show) await page.getByLabel('Mostrar en Contactos de emergencia').uncheck();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
    // La URL cambia antes de que se redibuje: esperar la ficha guardada antes de cargar la siguiente.
    await expect(page.locator('.page-title').last()).toHaveText(name);
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
  // Médicos: el primero sugiere "de cabecera"; se pueden sumar otros (psicólogo, psiquiatra…).
  await page.getByRole('button', { name: 'Agregar médico' }).click();
  const doctor1 = page.getByRole('group', { name: 'Médico 1' });
  await expect(doctor1.getByLabel('Especialidad')).toHaveValue('Médico de cabecera');
  await doctor1.getByLabel('Especialidad').fill('Pediatra');
  await doctor1.getByLabel('Nombre del médico').fill('Dra. Gómez');
  await doctor1.getByLabel('Teléfono').fill('4777-8888');
  await page.getByRole('button', { name: 'Agregar médico' }).click();
  const doctor2 = page.getByRole('group', { name: 'Médico 2' });
  await doctor2.getByLabel('Especialidad').fill('Psicólogo');
  await doctor2.getByLabel('Nombre del médico').fill('Lic. Ruiz');
  await doctor2.getByLabel('Teléfono').fill('4999-0000');
  // Obra social separada: nombre, plan, credencial y teléfono de emergencias.
  await page.getByLabel('Obra social', { exact: true }).fill('OSDE');
  await page.getByLabel('Plan').fill('310');
  await page.getByLabel('N.º de credencial').fill('61 234567 8 01');
  // Varios teléfonos de la obra social, cada uno con su nombre.
  await page.getByRole('button', { name: 'Agregar teléfono' }).click();
  await expect(page.getByLabel('Para qué es el teléfono 1')).toHaveValue('Emergencias');
  await page.getByLabel('Para qué es el teléfono 1').fill('Riesgo de vida');
  await page.getByLabel('Número del teléfono 1').fill('0810-888-7788');
  await page.getByRole('button', { name: 'Agregar teléfono' }).click();
  await page.getByLabel('Para qué es el teléfono 2').fill('Emergencias');
  await page.getByLabel('Número del teléfono 2').fill('0810-555-1234');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();

  // Ya guardados, cada médico en una línea; al abrirlo no se puede cambiar por otro.
  const doctorLines = page.getByTestId('doctor-line');
  await expect(doctorLines).toHaveCount(2);
  await expect(doctorLines.nth(0)).toHaveText('Pediatra: Dra. Gómez · 4777-8888');
  await page.getByRole('button', { name: 'Editar Dra. Gómez' }).click();
  await expect(page.getByRole('group', { name: 'Médico 1' }).getByLabel('Nombre del médico')).toHaveValue('Dra. Gómez');
  await expect(page.getByLabel('Elegir médico ya cargado')).toHaveCount(0);
  await page.getByRole('group', { name: 'Médico 1' }).getByRole('button', { name: 'Listo' }).click();
  await expect(doctorLines).toHaveCount(2);

  // El mismo médico se comparte con otra ficha: se elige de los ya cargados.
  await page.goto('/#/first-aid/contacts');
  await family.nth(0).getByRole('link', { name: 'Ficha médica de Juan' }).click();
  await expect(page.locator('.page-title').last()).toHaveText('Juan');
  await page.getByRole('button', { name: 'Agregar médico' }).click();
  const juanDoctor = page.getByRole('group', { name: 'Médico 1' });
  await juanDoctor.getByLabel('Elegir médico ya cargado').selectOption({ label: 'Dra. Gómez (Pediatra)' });
  await expect(juanDoctor.getByLabel('Teléfono')).toHaveValue('4777-8888');
  await expect(juanDoctor).toContainText('Compartido con Tomi');
  // Cambiar el teléfono desde acá lo cambia para todas las fichas.
  await juanDoctor.getByLabel('Teléfono').fill('4777-9999');
  // La obra social también se comparte: se elige y trae sus teléfonos; la credencial es de cada uno.
  await page.getByLabel('Elegir obra social ya cargada').selectOption({ label: 'OSDE' });
  await expect(page.getByLabel('Número del teléfono 1')).toHaveValue('0810-888-7788');
  await expect(page.getByTestId('insurance-shared')).toContainText('Compartida con Tomi');
  await page.getByLabel('N.º de credencial').fill('61 234567 8 02');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await expect(page.getByTestId('doctor-line')).toHaveText('Médico de cabecera: Dra. Gómez · 4777-9999');

  // En Mis contactos: los médicos una sola vez, con para quién son; la obra social y lo escrito en las fichas.
  await page.goto('/#/first-aid/contacts');
  const saved = page.getByTestId('my-contacts');
  await expect(saved.locator('li')).toHaveCount(3);
  await expect(saved).toContainText('Dra. Gómez');
  await expect(saved).toContainText('Médico · Pediatra · Pediatra de Tomi · Médico de cabecera de Juan');
  await expect(saved.getByRole('link', { name: '4777-9999' })).toBeVisible();
  await expect(saved).toContainText('Psicólogo de Tomi');
  // La obra social, una sola vez, con todos sus teléfonos y de quién es.
  const osde = saved.locator('li').filter({ hasText: 'OSDE' });
  await expect(osde).toContainText('Obra social · Obra social de Tomi · Obra social de Juan');
  await expect(osde.getByTestId('saved-insurance-phone')).toHaveCount(2);
  await expect(osde.getByTestId('saved-insurance-phone').nth(0)).toContainText('Riesgo de vida');
  await expect(osde.getByRole('link', { name: '0810-888-7788' })).toHaveAttribute('href', 'tel:08108887788');
  await expect(osde.getByRole('link', { name: '0810-555-1234' })).toHaveAttribute('href', 'tel:08105551234');
  const fromFichas = page.getByTestId('ficha-contacts').locator('li');
  await expect(fromFichas).toHaveCount(1);
  await expect(page.getByTestId('ficha-contacts')).toContainText('Contacto de emergencia de Tomi');
  await expect(page.getByTestId('ficha-contacts').getByRole('link', { name: '4222-3333' })).toHaveAttribute('href', 'tel:42223333');
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

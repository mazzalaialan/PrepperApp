import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

async function createVault(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

async function addProfile(page: Page, fields: { name: string; relationship: string; birth: string; blood?: string; allergies?: string }) {
  await page.goto('/#/first-aid/medical/new');
  await expect(page.getByRole('heading', { name: 'Nueva ficha' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill(fields.name);
  await page.getByLabel('Parentesco').fill(fields.relationship);
  await page.getByLabel('Fecha de nacimiento').fill(fields.birth);
  if (fields.blood) await page.getByLabel('Grupo sanguíneo').selectOption(fields.blood);
  if (fields.allergies) await page.getByLabel('Alergias').fill(fields.allergies);
}

async function save(page: Page, name: string) {
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await expect(page.locator('.page-title').last()).toHaveText(name);
}

test('compartir con un familiar: se suma sin borrar y se elige qué dato dejar', async ({ page, browser }, testInfo) => {
  // Ana: su ficha (Yo) y la de su hijo Tomi, con su pediatra.
  await createVault(page);
  await addProfile(page, { name: 'Ana', relationship: 'Yo', birth: '1985-04-10', blood: '0-' });
  await save(page, 'Ana');
  await addProfile(page, { name: 'Tomi', relationship: 'Hijo', birth: '2017-03-02', blood: 'A+', allergies: 'Penicilina' });
  await page.getByRole('button', { name: 'Agregar médico' }).click();
  const doctor = page.getByRole('group', { name: 'Médico 1' });
  await doctor.getByLabel('Especialidad').fill('Pediatra');
  await doctor.getByLabel('Nombre del médico').fill('Dra. Gómez');
  await doctor.getByLabel('Teléfono').fill('4777-8888');
  await save(page, 'Tomi');
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill('-41.13, -71.31');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/waypoints\/[0-9a-f-]{36}$/);

  await page.goto('/#/settings/backup');
  await page.getByRole('link', { name: 'Compartir con un familiar' }).click();
  // Se elige qué compartir: el inventario viene apagado; waypoints y rutas, prendidos.
  await expect(page.getByLabel('Inventario (artículos, ubicaciones, cantidades y vencimientos)')).not.toBeChecked();
  await expect(page.getByLabel('Waypoints, rutas y tracks')).toBeChecked();
  await page.getByLabel('Contraseña del envío').fill('envio-familia');
  await page.getByLabel('Repetir contraseña').fill('envio-familia');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Crear archivo para compartir' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^vikarg-familia-\d{4}-\d{2}-\d{2}\.vikshare$/);
  const file = testInfo.outputPath('familia.vikshare');
  await download.saveAs(file);

  // Juan (el papá) ya tiene su ficha y la de Tomi, con otro grupo sanguíneo.
  const other = await browser.newContext({ ...testInfo.project.use });
  const juan = await other.newPage();
  await createVault(juan);
  await addProfile(juan, { name: 'Juan', relationship: 'Yo', birth: '1983-08-20' });
  await save(juan, 'Juan');
  await addProfile(juan, { name: 'Tomi', relationship: 'Hijo', birth: '2017-03-02', blood: '0+' });
  await save(juan, 'Tomi');

  await juan.goto('/#/settings/share');
  await juan.getByTestId('share-file').setInputFiles(file);
  await juan.getByLabel('Contraseña que te dijo').fill('otra-clave');
  await juan.getByRole('button', { name: 'Abrir' }).click();
  await expect(juan.getByRole('alert')).toHaveText('La contraseña no es correcta.');
  await juan.getByLabel('Contraseña que te dijo').fill('envio-familia');
  await juan.getByRole('button', { name: 'Abrir' }).click();

  // Resumen antes de guardar: Ana llega como ficha nueva; Tomi ya está y tiene un dato distinto.
  const preview = juan.getByTestId('share-preview');
  await expect(preview).toContainText('Enviado por Ana');
  await expect(juan.getByTestId('share-new-profiles')).toHaveText('Ana');
  const tomi = juan.getByTestId('share-match');
  await expect(tomi).toHaveCount(1);
  await expect(tomi).toContainText('Se completan 2 datos que te faltaban.');
  await expect(tomi.getByLabel('Dejar el mío: 0+')).toBeChecked();
  await tomi.getByLabel('Usar el que llega: A+').check();
  await expect(preview).toContainText('Contactos: 1 nuevos, 0 completados.');
  await expect(juan.getByTestId('share-waypoints')).toHaveText('Waypoints: 1 nuevos, 0 rutas y 0 tracks.');
  await expect(juan.getByTestId('share-inventory')).toHaveCount(0);
  await juan.getByRole('button', { name: 'Guardar' }).click();
  await expect(juan.getByTestId('share-done')).toContainText('Listo: 1 fichas nuevas, 1 completadas, 1 contactos');

  // No se borró nada; Tomi sigue siendo "Hijo" para Juan y se completó; Ana llegó sin parentesco ni "Yo".
  await juan.goto('/#/first-aid/medical');
  await expect(juan.locator('.list-title')).toHaveText(['Ana', 'Juan', 'Tomi']);
  await juan.getByRole('link', { name: /^Tomi/ }).click();
  await expect(juan.getByLabel('Parentesco')).toHaveValue('Hijo');
  await expect(juan.getByLabel('Grupo sanguíneo')).toHaveValue('A+');
  await expect(juan.getByLabel('Alergias')).toHaveValue('Penicilina');
  await expect(juan.getByTestId('doctor-line')).toContainText('Pediatra: Dra. Gómez');
  await expect(juan.getByTestId('doctor-line').getByRole('link', { name: '4777-8888' })).toBeVisible();
  await juan.goto('/#/first-aid/contacts');
  await expect(juan.getByTestId('my-data')).toContainText('Juan');
  await expect(juan.getByTestId('my-contacts')).toContainText('Pediatra de Tomi');
  await juan.goto('/#/orientation/waypoints');
  await expect(juan.getByText('Refugio')).toBeVisible();

  // Recibir lo mismo otra vez no duplica nada.
  await juan.goto('/#/settings/share');
  await juan.getByTestId('share-file').setInputFiles(file);
  await juan.getByLabel('Contraseña que te dijo').fill('envio-familia');
  await juan.getByRole('button', { name: 'Abrir' }).click();
  await expect(juan.getByTestId('share-new-profiles')).toHaveCount(0);
  await expect(juan.getByRole('button', { name: 'No hay nada nuevo' })).toBeDisabled();
  await other.close();
});

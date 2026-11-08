import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
// Laguna Llanganuco, dentro del Parque Nacional Huascarán (Perú).
const HUASCARAN = { latitude: -9.03, longitude: -77.65 };
// Volcán Sajama, dentro del Parque Nacional Sajama (Bolivia).
const SAJAMA = { latitude: -18.108, longitude: -68.883 };

test.use({ geolocation: HUASCARAN, permissions: ['geolocation'] });

test('Perú y Bolivia: números, radio, parques y la red de radioaficionados de emergencia', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Perú: números oficiales y el CICOTOX; los sin confirmar, avisados.
  await page.goto('/#/first-aid/contacts');
  await page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Perú' }).click();
  const numbers = page.getByTestId('national-numbers');
  await expect(numbers).toContainText('Policía Nacional');
  await expect(numbers.getByTestId('national-pePoison')).toContainText('CICOTOX');
  await expect(numbers.getByTestId('unconfirmed-peMountain')).toContainText('Sin confirmar en una fuente oficial');
  await expect(numbers.getByTestId('unconfirmed-pePolice')).toHaveCount(0);

  // Radio en el Huascarán: la red RENER, el parque con el contacto del SERNANP y Radio Nacional de Huaraz.
  await page.goto('/#/first-aid/radio');
  const rener = page.getByTestId('rener-frequencies');
  await expect(rener).toContainText('146,960 MHz (−600 kHz, 82,5 Hz)');
  await expect(rener).toContainText('7.100 kHz LSB');
  await expect(rener).toContainText('Solo si tu vida depende de eso');
  const park = page.getByTestId('park-here');
  await expect(park).toContainText('Parque Nacional Huascarán · estás adentro');
  await expect(park).toContainText('El SERNANP no publica una frecuencia de radio');
  await expect(park.getByRole('link', { name: '920 201 317' })).toHaveAttribute('href', 'tel:920201317');
  await expect(page.getByTestId('radio-stations').locator('li').first()).toContainText('Radio Nacional del Perú · Huaraz');
  // Sin mapas de Argentina ni Chile: las frecuencias de montaña de esos países no aparecen.
  await expect(page.getByTestId('mountain-frequencies')).toHaveCount(0);

  // Bolivia: Sajama, con el contacto del SERNAP y sin la red de Perú.
  await context.setGeolocation(SAJAMA);
  await page.goto('/#/first-aid/contacts');
  await page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Bolivia' }).click();
  await expect(page.getByTestId('national-numbers').getByTestId('unconfirmed-boPolice')).toBeVisible();
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('park-here')).toContainText('Parque Nacional Sajama · estás adentro');
  await expect(page.getByTestId('park-here')).toContainText('El SERNAP no publica una frecuencia de radio');
  await expect(page.getByTestId('park-here').getByRole('link', { name: '+591 2 2426304' })).toBeVisible();
  await expect(page.getByTestId('rener-frequencies')).toHaveCount(0);
  await page.screenshot({ path: 'e2e-results/screens/desktop-85-radio-bolivia.png', fullPage: true });
});

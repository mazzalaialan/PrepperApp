import { magvar } from 'magvar';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const HERE = { latitude: -34.603722, longitude: -58.381592 };
const TARGET = { lat: -34.595, lon: -58.372 }; // ~1,3 km al NE

test.use({
  geolocation: HERE,
  permissions: ['geolocation', 'camera'],
  // Cámara falsa de Chromium (patrón de prueba) sin diálogo de permiso.
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

/** Simula el sensor: emite `deviceorientationabsolute` continuamente con los ángulos que se fijen. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __orientation: { alpha: number; beta: number; gamma: number } };
    w.__orientation = { alpha: 0, beta: 0, gamma: 0 };
    setInterval(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { ...w.__orientation, absolute: true }));
    }, 30);
  });
});

const setOrientation = (page: Page, alpha: number, beta: number, gamma = 0) =>
  page.evaluate((o) => ((window as unknown as { __orientation: object }).__orientation = o), { alpha, beta, gamma });

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(b.lon - a.lon)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

test('brújula: norte verdadero con declinación y magnético', async ({ page }) => {
  await setup(page);
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Brújula/ }).click();

  // Celular acostado apuntando al norte magnético: el norte verdadero está ~9,5° al este.
  await setOrientation(page, 0, 0);
  await expect(page.getByTestId('declination')).toHaveText(/Declinación en tu ubicación: \d+,\d° O/);
  await expect(page.getByTestId('compass-heading')).toHaveText(/^35\d° N$/);
  await page.getByRole('button', { name: 'Magnético' }).click();
  await expect(page.getByTestId('compass-heading')).toHaveText('0° N');
  await setOrientation(page, 90, 0); // girado 90° a la izquierda → oeste
  await expect(page.getByTestId('compass-heading')).toHaveText('270° O');
});

test('ir al punto: flecha con el celular acostado y realidad aumentada parado', async ({ page }, testInfo) => {
  await setup(page);
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill(`${TARGET.lat}, ${TARGET.lon}`);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('link', { name: 'Ir a este punto' }).click();
  await expect(page.getByRole('heading', { name: 'Ir a Refugio' })).toBeVisible();
  await expect(page.getByTestId('goto-distance')).toHaveText(/^1,\d+ km$/);

  const trueBearing = bearing({ lat: HERE.latitude, lon: HERE.longitude }, TARGET);
  const declination = magvar(HERE.latitude, HERE.longitude, 0, new Date());
  const magneticToTarget = trueBearing - declination;

  // Acostado, mirando al norte magnético: hay que girar a la derecha.
  await page.getByRole('button', { name: 'Apagar la cámara' }).click();
  await setOrientation(page, 0, 0);
  await expect(page.getByTestId('goto-turn')).toHaveText(/Girá \d+° a la derecha/);
  await expect(page.getByTestId('rose-target')).toBeVisible();
  // Apuntando al punto: seguí derecho.
  await setOrientation(page, (360 - magneticToTarget) % 360, 0);
  await expect(page.getByTestId('goto-turn')).toHaveText('Seguí derecho');

  // Parado con la cámara hacia el punto: marcador en el centro de la imagen.
  await page.getByRole('button', { name: 'Ver con la cámara' }).click();
  await setOrientation(page, (360 - magneticToTarget) % 360, 90);
  const marker = page.getByTestId('ar-marker');
  await expect(marker).toBeVisible();
  await expect(marker).toContainText('Refugio');
  const view = await page.locator('.ar-view').boundingBox();
  const box = await marker.boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - (view!.x + view!.width / 2))).toBeLessThan(view!.width * 0.05);
  await page.waitForTimeout(500); // que la cámara falsa muestre imagen
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-13-ar.png` });

  // Pantalla completa: la cámara ocupa toda la pantalla, con los datos encima.
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.locator('.fs-overlay')).toContainText(/Refugio · 1,\d+ km/);
  await expect(page.locator('.fs-overlay')).toContainText('Seguí derecho');
  const viewport = page.viewportSize()!;
  await expect.poll(async () => (await page.locator('.ar-view').boundingBox())!.height).toBeGreaterThanOrEqual(viewport.height - 2);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-13b-ar-fullscreen.png` });
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect(page.locator('.fs-overlay')).toHaveCount(0);

  // De espaldas al punto: indicador al costado para girar.
  await setOrientation(page, (360 - magneticToTarget + 180) % 360, 90);
  await expect(page.getByTestId('ar-edge')).toBeVisible();
  await expect(marker).toHaveCount(0);
});

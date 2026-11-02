import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

async function mockMaps(page: Page) {
  // Elevación plana (Terrarium: 0 m = R128 G0 B0).
  const dem = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 128, g: 0, b: 0 } } }).png().toBuffer();
  const ctx = page.context();
  await ctx.route('https://tiles.openfreemap.org/planet', (route) => route.fulfill({ json: { tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'] } }));
  // Teselas vacías (válidas para MapLibre) y letras vacías: lo que se prueba es la descarga y el uso sin conexión.
  await ctx.route('https://tiles.openfreemap.org/planet/test/**', (route) => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await ctx.route('https://tiles.openfreemap.org/fonts/**', (route) => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await ctx.route('https://s3.amazonaws.com/elevation-tiles-prod/**', (route) => route.fulfill({ body: dem, contentType: 'image/png' }));
}

const cacheKeys = (page: Page) =>
  page.evaluate(async () => {
    const cache = await caches.open('vikarg-maps');
    return (await cache.keys()).map((r) => r.url);
  });

test('mapas offline: descargar una zona, verla sin conexión y borrarla', async ({ page, context }, testInfo) => {
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation');
  await page.getByRole('link', { name: /Mapas offline/ }).click();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  // El mapa ocupa su lugar (MapLibre cambia el posicionamiento del contenedor) y tiene los controles.
  expect((await page.getByTestId('offline-map').locator('canvas').boundingBox())!.height).toBeGreaterThan(250);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  // Va solo a la ubicación del GPS.
  await expect(page.getByTestId('map-center')).toHaveText(/^Centro: 34°36′\d+(\.\d+)?″ S 58°22′\d+(\.\d+)?″ O · zoom 12$/, { timeout: 15_000 });
  await expect(page.getByText('Todavía no descargaste ninguna zona.')).toBeVisible();

  // Descargar 2 km a la redonda, con todo el detalle.
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Nombre').fill('Casa');
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await expect(page.getByTestId('zone-estimate')).toHaveText(/^Unas \d+ teselas, ~[\d,]+ MB/);
  // 50 km con todo el detalle supera lo que permite el servicio.
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '50 km' });
  await expect(page.getByTestId('zone-estimate')).toContainText('Es demasiado para una sola descarga');
  await expect(page.getByRole('button', { name: 'Descargar', exact: true })).toBeDisabled();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByTestId('zone-message')).toHaveText(/^Listo: "Casa" quedó disponible sin conexión/, { timeout: 30_000 });
  await expect(page.getByTestId('zone-list')).toContainText('Casa');
  await expect(page.getByTestId('zone-list')).toContainText('2 km de radio');

  const keys = await cacheKeys(page);
  expect(keys.some((k) => k.startsWith('https://vikarg.local/tiles/14/'))).toBe(true);
  expect(keys.some((k) => k.includes('/elevation-tiles-prod/terrarium/12/'))).toBe(true);
  expect(keys.some((k) => k.includes('/fonts/Noto%20Sans%20Regular/0-255.pbf'))).toBe(true);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-18-maps.png`, fullPage: true });

  // Capas: quedan guardadas.
  await page.getByRole('button', { name: 'Curvas de nivel' }).click();
  await expect(page.getByRole('button', { name: 'Curvas de nivel' })).toHaveAttribute('aria-pressed', 'false');

  // Sin conexión: la zona sigue en el dispositivo y el mapa se dibuja.
  await context.setOffline(true);
  await page.goto('/#/orientation');
  await page.goto('/#/orientation/maps');
  await expect(page.getByText('Sin conexión: se ven las zonas descargadas')).toBeVisible();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('zone-list')).toContainText('2 km de radio');
  await expect(page.getByRole('button', { name: 'Descargar una zona' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Curvas de nivel' })).toHaveAttribute('aria-pressed', 'false');
  await context.setOffline(false);

  // Borrar: se libera el espacio.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar Casa' }).click();
  await expect(page.getByText('Todavía no descargaste ninguna zona.')).toBeVisible();
  expect((await cacheKeys(page)).filter((k) => k.startsWith('https://vikarg.local/tiles/'))).toHaveLength(0);
});

test('mapa en 3D o plano, y la vista siguiéndome o libre', async ({ page, context }) => {
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/maps');
  const map = page.getByTestId('offline-map');
  await expect(page.getByTestId('map-center')).toContainText('zoom 12', { timeout: 15_000 });

  // Arranca plano; en 3D se inclina con relieve, y queda guardado.
  const threeD = page.getByRole('button', { name: 'Mapa en 3D' });
  await expect(threeD).toHaveAttribute('aria-pressed', 'false');
  await expect(threeD).toHaveText('2D');
  await threeD.click();
  await expect(threeD).toHaveText('3D');
  await expect(map).toHaveAttribute('data-pitch', '60');
  await expect(map).toHaveAttribute('data-terrain', 'on');
  await page.goto('/#/orientation');
  await page.goto('/#/orientation/maps');
  await expect(page.getByRole('button', { name: 'Mapa en 3D' })).toHaveAttribute('aria-pressed', 'true');

  // Siguiéndome: el mapa va adonde voy.
  const follow = page.getByRole('button', { name: 'Seguir mi posición' });
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await context.setGeolocation({ latitude: -34.62, longitude: -58.4 });
  await expect(page.getByTestId('map-center')).toHaveText(/^Centro: 34°37′1\d(\.\d+)?″ S 58°24′\d+(\.\d+)?″ O/, { timeout: 10_000 });

  // Arrastrar el mapa pasa a vista libre.
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');

  // De vuelta a plano.
  await page.getByRole('button', { name: 'Mapa en 3D' }).click();
  await expect(map).toHaveAttribute('data-pitch', '0');
  await expect(map).toHaveAttribute('data-terrain', 'off');
});

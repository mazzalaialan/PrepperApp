import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const QUAKE = { lon: -61, lat: -38 };
const FIRE = { lon: -60.5, lat: -26.5 };

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

/** Mismo encuadre que la app (projection.ts): los tres países con 8 px de margen. */
function screenPoint(lon: number, lat: number, width: number, height: number) {
  const R = 6_378_137;
  const merc = (lo: number, la: number) => ({ x: (R * lo * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) });
  const sw = merc(-76, -58);
  const ne = merc(-52, -21);
  const scale = Math.min((width - 16) / (ne.x - sw.x), (height - 16) / (ne.y - sw.y));
  const c = { x: (sw.x + ne.x) / 2, y: (sw.y + ne.y) / 2 };
  const m = merc(lon, lat);
  return { x: width / 2 + (m.x - c.x) * scale, y: height / 2 - (m.y - c.y) * scale };
}

async function mockSources(page: Page) {
  // Imagen de relleno con ruido: más de 200 bytes, así cuenta como imagen publicada.
  const noise = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 97) % 251));
  const png = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  const ctx = page.context();
  await ctx.route('https://gibs.earthdata.nasa.gov/**', (route) => route.fulfill({ body: png, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.route('https://tilecache.rainviewer.com/**', (route) => route.fulfill({ body: png, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.route('https://api.rainviewer.com/**', (route) => {
    const now = Math.floor(Date.now() / 600_000) * 600;
    route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, i) => ({ time: now - (12 - i) * 600, path: `/v2/radar/f${i}` })) } } });
  });
  await ctx.route('https://earthquake.usgs.gov/**', (route) =>
    route.fulfill({
      json: {
        features: [
          { id: 'q1', properties: { mag: 5.2, place: '100 km S de Bahía Blanca', time: Date.now() - 3_600_000, url: 'https://earthquake.usgs.gov/q1' }, geometry: { coordinates: [QUAKE.lon, QUAKE.lat, 10] } },
          { id: 'lejos', properties: { mag: 6, place: 'Japón', time: Date.now(), url: 'https://x' }, geometry: { coordinates: [140, 35, 10] } },
        ],
      },
    }),
  );
  await ctx.route('https://www.gdacs.org/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { type: 'Point', coordinates: [FIRE.lon, FIRE.lat] },
            properties: {
              eventtype: 'WF', eventid: 7, episodeid: 1, name: 'Incendio en Chaco', alertlevel: 'Orange',
              fromdate: '2026-10-29T00:00:00', todate: '2026-10-31T00:00:00', severitydata: { severitytext: '12000 ha' }, url: { report: 'https://www.gdacs.org/r7' },
            },
          },
        ],
      },
    }),
  );
  await ctx.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const n = new URL(route.request().url()).searchParams.get('latitude')!.split(',').length;
    route.fulfill({
      json: Array.from({ length: n }, (_, i) => ({
        current: { temperature_2m: i === 0 ? 36 : 18, precipitation: i % 3 === 0 ? 2.5 : 0, weather_code: 3, wind_speed_10m: 15, wind_direction_10m: 200, wind_gusts_10m: 30 },
      })),
    });
  });
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

async function tap(page: Page, lon: number, lat: number) {
  const map = page.getByTestId('weather-map');
  await map.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await map.boundingBox())!;
  const p = screenPoint(lon, lat, box.width, box.height);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

test('mapa de tiempo: capas, animación, tocar un sismo o una alerta, y sin conexión', async ({ page, context }, testInfo) => {
  await mockSources(page);
  await setup(page);
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Mapa/ }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de tiempo' })).toBeVisible();
  await expect(page.getByTestId('weather-map')).toBeVisible();

  // Satélite prendido por defecto: 2 horas de imágenes para animar.
  await expect(page.getByTestId('map-times').first()).toHaveText(/^Satélite \d\d:\d\d$/);
  await expect(page.getByRole('button', { name: 'Reproducir las últimas 2 horas' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Momento' })).toHaveValue('12');
  await page.getByRole('button', { name: 'Reproducir las últimas 2 horas' }).click();
  await expect(page.getByRole('slider', { name: 'Momento' })).not.toHaveValue('12');
  await page.getByRole('button', { name: 'Pausar' }).click();

  // Radar: se suma su hora y se bajan los 13 cuadros (2 horas), con pocas teselas cada uno.
  const radarTiles = new Map<string, Set<string>>();
  page.on('request', (r) => {
    const m = r.url().match(/tilecache\.rainviewer\.com\/v2\/radar\/(f\d+)\/(.+)$/);
    if (m) radarTiles.set(m[1]!, (radarTiles.get(m[1]!) ?? new Set()).add(m[2]!));
  });
  await page.getByRole('button', { name: 'Radar de lluvia' }).click();
  await expect(page.getByTestId('map-times').first()).toHaveText(/^Satélite \d\d:\d\d · Radar \d\d:\d\d$/);
  await expect.poll(() => radarTiles.size, { timeout: 15_000 }).toBe(13);
  await expect(page.getByTestId('frames-progress')).toHaveCount(0, { timeout: 15_000 });
  for (const tiles of radarTiles.values()) expect(tiles.size).toBeLessThanOrEqual(16);
  await expect(page.getByText('En Argentina solo cubre el noreste')).toBeVisible();

  // Tocar un sismo muestra sus datos.
  await page.waitForTimeout(700); // que la vista quede quieta
  await tap(page, QUAKE.lon, QUAKE.lat);
  const card = page.getByTestId('map-feature');
  await expect(card).toContainText('Sismo M 5,2');
  await expect(card).toContainText('100 km S de Bahía Blanca');
  await expect(card).toContainText('Profundidad 10 km');
  await expect(card.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', 'https://earthquake.usgs.gov/q1');

  // Y una alerta de GDACS (incendio forestal).
  await tap(page, FIRE.lon, FIRE.lat);
  await expect(card).toContainText('Incendio en Chaco');
  await expect(card).toContainText('Incendio forestal · alerta naranja');
  await expect(card).toContainText('12000 ha');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17-weather-map.png`, fullPage: true });

  // Las capas quedan guardadas.
  await page.getByRole('button', { name: 'Sismos' }).click();
  await expect(page.getByRole('button', { name: 'Sismos' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Viento' }).click();
  await expect(page.getByText(/Viento por zona en km\/h/)).toBeVisible();
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByRole('button', { name: 'Sismos' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Viento' })).toHaveAttribute('aria-pressed', 'true');
  // Rayos: necesita el servidor propio.
  await expect(page.getByRole('button', { name: 'Rayos' })).toBeDisabled();
  // La página no se ensancha en el celular.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Sin conexión: el mapa sigue, con lo último guardado.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByText('Sin conexión: se ven el mapa')).toBeVisible();
  await expect(page.getByTestId('weather-map')).toBeVisible();
  await context.setOffline(false);
});

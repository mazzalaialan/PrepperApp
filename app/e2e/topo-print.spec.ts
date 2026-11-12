import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

/** Un recorrido de ~6,6 km (norte-sur) con un waypoint: a 1:25.000 no entra en la hoja, a 1:50.000 sí. */
const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="prueba" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="-41.1900" lon="-71.4400"><ele>1500</ele><name>Refugio Lynch</name></wpt>
  <trk>
    <name>Cruce de prueba</name>
    <trkseg>
      <trkpt lat="-41.1600" lon="-71.4200"><ele>1000</ele></trkpt>
      <trkpt lat="-41.1800" lon="-71.4300"><ele>1150</ele></trkpt>
      <trkpt lat="-41.1900" lon="-71.4400"><ele>1500</ele></trkpt>
      <trkpt lat="-41.2200" lon="-71.4500"><ele>1300</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const pdfText = (path: string) => readFileSync(path).toString('latin1');

test('mapa topográfico: opciones antes de generar (las escalas que no entran, grisadas) y PDF A4 vertical y horizontal, también sin conexión', async ({ page, context }) => {
  test.setTimeout(300_000);
  // Sin teselas: el mapa sale vacío, pero la hoja (cuadrícula, escala, tabla) se arma igual.
  await context.route(/tiles\.openfreemap\.org|elevation-tiles-prod/, (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'cruce.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(GPX) });
  await expect(page.getByRole('heading', { name: 'Cruce de prueba' })).toBeVisible();

  // El botón abre el cuadro de opciones: todavía no se generó nada.
  await page.getByTestId('track-print-map').click();
  const dialog = page.getByTestId('topo-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('topo-route-size')).toContainText('km');

  // La ruta mide ~6,6 km: a 1:10.000, 1:15.000 y 1:25.000 no entra (en gris); desde 1:50.000 sí, y es la elegida por defecto.
  for (const s of [10_000, 15_000, 25_000]) await expect(page.getByTestId(`topo-scale-${s}`)).toBeDisabled();
  for (const s of [50_000, 75_000, 100_000, 250_000]) await expect(page.getByTestId(`topo-scale-${s}`)).toBeEnabled();
  await expect(page.getByTestId('topo-scale-50000')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('topo-scale-info')).toContainText('cuadrícula UTM de 1 km × 1 km (20 mm en el papel)');

  // Sin teselas descargadas y con conexión: avisa que se van a bajar de internet.
  await expect(page.getByTestId('topo-coverage')).toHaveAttribute('data-state', 'partial-online');
  await expect(page.getByTestId('topo-coverage')).toContainText('se bajan de internet');

  // Elegir otra escala cambia la leyenda; las grisadas no responden.
  await page.getByTestId('topo-scale-100000').click();
  await expect(page.getByTestId('topo-scale-100000')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('topo-scale-info')).toContainText('2 km × 2 km (20 mm en el papel)');
  await page.getByTestId('topo-scale-50000').click();

  // Generar en vertical: baja un PDF A4 (595,28 × 841,89 pt).
  await page.getByTestId('topo-orient-portrait').click();
  const [portrait] = await Promise.all([page.waitForEvent('download', { timeout: 200_000 }), page.getByTestId('topo-generate').click().then(() => page.getByTestId('topo-download').click())]);
  expect(portrait.suggestedFilename()).toBe('Cruce-de-prueba-A4-1-50000.pdf');
  const portraitPdf = pdfText((await portrait.path())!);
  expect(portraitPdf.startsWith('%PDF-1.4')).toBe(true);
  expect(portraitPdf).toContain('/MediaBox [0 0 595.28 841.89]');
  expect(portraitPdf.length).toBeGreaterThan(20_000);
  await expect(page.getByTestId('topo-done')).toBeVisible();

  // Con el PDF listo, el cuadro solo ofrece abrir, compartir, descargar o cerrar: nada de opciones ni del botón de generar.
  await expect(page.getByTestId('topo-open')).toBeVisible();
  await expect(page.getByTestId('topo-share')).toBeVisible();
  await expect(page.getByTestId('topo-close')).toBeVisible();
  await expect(page.getByTestId('topo-generate')).toHaveCount(0);
  await expect(page.getByTestId('topo-scales')).toHaveCount(0);
  await expect(page.getByTestId('topo-paper-a4')).toHaveCount(0);
  await page.getByTestId('topo-close').click();
  await expect(page.getByTestId('topo-dialog')).toHaveCount(0);
  await page.getByTestId('track-print-map').click();

  // Sin conexión también se arma (el código ya está cargado y el mapa de la zona viene de lo descargado): ahora en horizontal.
  await context.setOffline(true);
  // Sin conexión y sin la zona descargada: avisa que la hoja saldría con huecos (se puede generar igual).
  await expect(page.getByTestId('topo-coverage')).toHaveAttribute('data-state', 'partial-offline');
  await expect(page.getByTestId('topo-coverage')).toContainText('con huecos');
  await page.getByTestId('topo-paper-oficio').click();
  await page.getByTestId('topo-orient-landscape').click();
  await page.getByTestId('topo-latlon').check();
  const [landscape] = await Promise.all([page.waitForEvent('download', { timeout: 200_000 }), page.getByTestId('topo-generate').click().then(() => page.getByTestId('topo-download').click())]);
  const landscapePdf = pdfText((await landscape.path())!);
  // Oficio de la Argentina (216 × 330 mm) apaisado: 935,43 × 612,28 pt.
  expect(landscapePdf).toContain('/MediaBox [0 0 935.43 612.28]');
  await expect(page.getByTestId('topo-error')).toHaveCount(0);
});

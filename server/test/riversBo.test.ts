import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { isoDate, latestReportUrl, matchReadings, parseNiveles, reportDateOf, type BoLevels } from '../src/rivers/bo.ts';
import { riversRoutes } from '../src/routes/rivers.ts';
import { loadConfig } from '../src/config.ts';

// Texto como lo da el PDF de «Reporte de niveles diarios» (una fila por línea).
const text = `Jueves, 12 de noviembre de 2026
REPORTE DE NIVELES DIARIOSFECHA LECTURA FECHA LECTURA
ISLA DEL SOL TITICACA 3/11/2026 101 4/11/2026 101 - SE MANTIENE
HUATAJATA TITICACA 11/11/2026 321 12/11/2026 320 - DESCENSO
CALACOTO DESAGUADERO 1/8/2026 108 2/8/2026 108 350 SE MANTIENE
PUENTE CHAUNACA RAVELO 11/11/2026 92 12/11/2026 83 - DESCENSO
CAMIACO MAMORÉ 11/11/2026 494 12/11/2026 487 1200 DESCENSO
PUENTE DE LA AMISTAD ACRE 11/11/2026 151 12/11/2026 151 SE MANTIENE
RIBERALTA-SNHN BENI 11/11/2026 372 12/11/2026 381 1100 ASCENSO
EL SENA MADRE DE DIOS 11/11/2026 340 12/11/2026 343 800 ASCENSO
Calle Reyes Ortiz N° - 41 - Telefono: 2355824 – Web: www.senamhi.gob.bo`;

describe('niveles de ríos de Bolivia (SENAMHI)', () => {
  it('lee las filas de la tabla: dos lecturas, nivel cero de barranco y comportamiento', () => {
    const rows = parseNiveles(text);
    assert.equal(rows.length, 8);
    assert.deepEqual(rows[1], { key: 'HUATAJATA TITICACA', prevDate: '2026-11-11', prevCm: 321, lastDate: '2026-11-12', lastCm: 320, zeroCm: null, trend: 'falling' });
    assert.equal(rows[2]!.zeroCm, 350);
    // Sin nivel cero (la celda queda vacía) también se lee.
    const acre = rows.find((r) => r.key.startsWith('PUENTE DE LA AMISTAD'))!;
    assert.equal(acre.zeroCm, null);
    assert.equal(acre.trend, 'steady');
    assert.equal(rows.find((r) => r.key.startsWith('EL SENA'))!.trend, 'rising');
  });

  it('la fecha del reporte y la conversión de fechas', () => {
    assert.equal(reportDateOf(text), '2026-11-12');
    assert.equal(reportDateOf('sin fecha'), null);
    assert.equal(isoDate('3/11/2026'), '2026-11-03');
  });

  it('el reporte más nuevo de la página de listados', () => {
    const html = `
      <a href="https://senamhi.gob.bo/x/Noviembre/REPORTE_DE_NIVELES_11112026_SENAMHI.pdf">11</a>
      <a href="https://senamhi.gob.bo/x/Noviembre/REPORTE_DE_NIVELES_12112026_SENAMHI.pdf">12</a>
      <a href="https://senamhi.gob.bo/x/Octubre/REPORTE_DE_NIVELES_30102026_SENAMHI.pdf">30</a>`;
    assert.equal(latestReportUrl(html), 'https://senamhi.gob.bo/x/Noviembre/REPORTE_DE_NIVELES_12112026_SENAMHI.pdf');
    assert.equal(latestReportUrl('<html></html>'), null);
  });

  it('une cada fila con su estación del catálogo (el resto del texto es el río) y deja afuera las que no tienen ubicación', () => {
    const stations = [{ name: 'HUATAJATA' }, { name: 'PUENTE CHAUNACA' }, { name: 'CAMIACO' }, { name: 'RIBERALTA' }];
    const r = matchReadings(parseNiveles(text), stations);
    assert.deepEqual(r.map((x) => [x.station, x.river]), [
      ['HUATAJATA', 'TITICACA'],
      ['PUENTE CHAUNACA', 'RAVELO'],
      ['CAMIACO', 'MAMORÉ'],
      ['RIBERALTA', 'BENI'],
    ]);
    // Si una estación es parte del nombre de otra, gana la más larga: «PUENTE CHAUNACA» y no «PUENTE».
    const longer = matchReadings(parseNiveles(text), [{ name: 'PUENTE' }, { name: 'PUENTE CHAUNACA' }]);
    assert.deepEqual(longer.map((x) => x.station).sort(), ['PUENTE', 'PUENTE CHAUNACA']);
  });
});

describe('GET /api/rivers/bo', () => {
  const levels = (fetchedAt: number): BoLevels => ({ reportDate: '2026-11-12', fetchedAt, url: 'https://x/r.pdf', readings: [{ station: 'HUATAJATA', river: 'TITICACA', prevDate: '2026-11-11', prevCm: 321, lastDate: '2026-11-12', lastCm: 320, zeroCm: null, trend: 'falling' }] });
  const build = (fetch: () => Promise<BoLevels>, clock: { t: number }) => {
    const app = Fastify();
    // Catálogo: el archivo real de la app.
    riversRoutes(app, { ...loadConfig({}), appDir: new URL('../../app/public', import.meta.url).pathname }, { fetch }, () => clock.t);
    return app;
  };

  it('lee una vez y guarda 3 horas; pasado ese tiempo vuelve a leer', async () => {
    let calls = 0;
    const clock = { t: 1_000_000 };
    const app = build(async () => (calls++, levels(clock.t)), clock);
    const a = await app.inject({ method: 'GET', url: '/api/rivers/bo' });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().stale, false);
    assert.equal(a.json().readings[0].station, 'HUATAJATA');
    assert.equal(a.headers['cache-control'], 'no-store');
    clock.t += 2 * 3_600_000;
    await app.inject({ method: 'GET', url: '/api/rivers/bo' });
    assert.equal(calls, 1);
    clock.t += 2 * 3_600_000;
    await app.inject({ method: 'GET', url: '/api/rivers/bo' });
    assert.equal(calls, 2);
  });

  it('si el SENAMHI falla devuelve el último bueno marcado como viejo, y 503 si no hay ninguno', async () => {
    const clock = { t: 1_000_000 };
    let fail = false;
    const app = build(async () => {
      if (fail) throw new Error('SENAMHI Bolivia 500');
      return levels(clock.t);
    }, clock);
    fail = true;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/bo' })).statusCode, 503);
    fail = false;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/bo' })).statusCode, 200);
    fail = true;
    clock.t += 4 * 3_600_000;
    const stale = await app.inject({ method: 'GET', url: '/api/rivers/bo' });
    assert.equal(stale.statusCode, 200);
    assert.equal(stale.json().stale, true);
    // Pasados 7 días sin poder leer: ya no se ofrece.
    clock.t += 8 * 86_400_000;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/bo' })).statusCode, 503);
  });
});

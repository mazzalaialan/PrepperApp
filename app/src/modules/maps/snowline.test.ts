import { describe, expect, it } from 'vitest';
import { needsRefresh, snowlineFrom } from './snowline';
import { paintSlope } from './slope';

describe('línea de nieve para la capa de avalanchas', () => {
  it('es la isoterma de 0 °C más baja menos 300 m, redondeada', () => {
    expect(snowlineFrom([2250, 1380, null, 1900])).toEqual({ meters: 1100, freezingMin: 1380 });
    expect(snowlineFrom([150])).toEqual({ meters: 0, freezingMin: 150 });
    expect(snowlineFrom([null])).toBeNull();
  });

  it('se vuelve a consultar lejos o vieja', () => {
    const s = { meters: 1100, freezingMin: 1380, lat: -41.17, lon: -71.44, at: 1_000_000, windFrom: [] };
    expect(needsRefresh(null, s)).toBe(true);
    expect(needsRefresh(s, { lat: -41.2, lon: -71.4 }, 1_000_000 + 60_000)).toBe(false);
    expect(needsRefresh(s, { lat: -40.5, lon: -71.4 }, 1_000_000 + 60_000)).toBe(true); // ~75 km
    expect(needsRefresh(s, s, 1_000_000 + 4 * 3_600_000)).toBe(true);
  });

  it('debajo de la línea de nieve no se pinta aunque sea empinado', () => {
    const colors = { low: '#6f9e4c', caution: '#d0a03c', avalanche: '#b84a30', steep: '#e8231b' };
    const px = paintSlope(new Float32Array([38, 38, 10, 10]), colors, { alpha: 190, elev: new Float32Array([900, 1500, 900, 1500]), minElevation: 1100 });
    expect(px[3]).toBe(0);
    expect(px[7]).toBe(190);
    // Lo plano: verde arriba de la línea de nieve, sin color abajo.
    expect(px[11]).toBe(0);
    expect(px[15]).toBe(190);
  });
});

describe('línea de nieve sin conexión', () => {
  const H = 3_600_000;
  const start = Date.UTC(2026, 10, 1);
  // 17 días por hora: los primeros 3 a 1.000 m, después 2.500 m.
  const series = { start, at: start + 3 * 24 * H, values: Array.from({ length: 17 * 24 }, (_, i) => (i < 3 * 24 ? 1000 : 2500)) };
  const zones = [{ name: 'Catedral', lat: -41.17, lon: -71.44, radiusKm: 20, freezing: series }];

  it('usa la ventana de 3 días atrás y 2 adelante de hoy, hasta donde llega la serie', async () => {
    const { snowlineAt } = await import('./snowline');
    expect(snowlineAt(series, start + 4 * 24 * H)).toEqual({ meters: 700, freezingMin: 1000 });
    // Una semana después ya no entra la nevada vieja.
    expect(snowlineAt(series, start + 8 * 24 * H)).toEqual({ meters: 2200, freezingMin: 2500 });
    expect(snowlineAt(series, start + 18 * 24 * H)).toBeNull();
  });

  it('elige la del lugar, la de la zona cercana o ninguna (nunca una de otro lugar)', async () => {
    const { chooseSnowline } = await import('./snowline');
    const now = start + 8 * 24 * H;
    const live = { meters: 1500, freezingMin: 1800, lat: -41.17, lon: -71.44, at: now - H };
    expect(chooseSnowline({ lat: -41.2, lon: -71.4 }, live, zones, now)).toMatchObject({ source: 'live', meters: 1500 });
    // Sin conexión (consulta vieja): la de la zona.
    expect(chooseSnowline({ lat: -41.2, lon: -71.4 }, { ...live, at: now - 3 * 24 * H }, zones, now)).toMatchObject({ source: 'zone', meters: 2200, zone: 'Catedral' });
    // Mendoza: lejos de la zona y de la consulta.
    expect(chooseSnowline({ lat: -32.65, lon: -70.0 }, live, zones, now)).toEqual({ source: 'none' });
  });
});

describe('renovar el pronóstico de las zonas', () => {
  it('solo las que no lo tienen o lo tienen con más de un día', async () => {
    const { staleZones } = await import('./zoneForecast');
    const now = Date.UTC(2026, 10, 4);
    const zone = (id: string, at?: number, extra: object = { windDir: [] }, prevailing: object | null = { from: [270], at: 0 }) =>
      ({
        id,
        name: id,
        lat: 0,
        lon: 0,
        radiusKm: 5,
        maxZoom: 14,
        bytes: 0,
        failed: 0,
        createdAt: '',
        ...(at ? { freezing: { start: 0, values: [], at, ...extra } } : {}),
        ...(prevailing ? { prevailing } : {}),
      }) as never;
    const ids = (zs: { id: string }[]) => zs.map((z) => z.id);
    expect(ids(staleZones([zone('sin'), zone('vieja', now - 25 * 3_600_000), zone('nueva', now - 3_600_000)], now))).toEqual(['sin', 'vieja']);
    // Bajadas antes de que existiera el viento: también.
    expect(ids(staleZones([zone('sin-viento', now - 3_600_000, {}), zone('sin-habitual', now - 3_600_000, { windDir: [] }, null)], now))).toEqual(['sin-viento', 'sin-habitual']);
  });
});

describe('limpieza del pronóstico guardado', () => {
  it('saca las horas de más de 7 días atrás (las que usa el viento) y borra lo vencido', async () => {
    const { pruneSeries, snowlineAt } = await import('./snowline');
    const H = 3_600_000;
    const start = Date.UTC(2026, 10, 1);
    const series = { start, at: start, values: Array.from({ length: 10 * 24 }, (_, i) => 1000 + i) };
    const now = start + 9 * 24 * H;
    const pruned = pruneSeries(series, now)!;
    expect(pruned.values.length).toBe(8 * 24);
    expect(pruned.start).toBe(start + 2 * 24 * H);
    // La línea de nieve de hoy no cambia.
    expect(snowlineAt(pruned, now)).toEqual(snowlineAt(series, now));
    expect(pruneSeries(series, start + H)).toBe(series);
    expect(pruneSeries(series, start + 18 * 24 * H)).toBeNull();
  });
});

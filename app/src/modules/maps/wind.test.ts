import { describe, expect, it } from 'vitest';
import { chooseWind, pruneSeries, windLoadAt, type FreezingSeries } from './snowline';
import { archiveBase, compassList, isLee, leeAspects, prevailingFrom, windLoadFrom } from './wind';

const H = 3_600_000;
const repeat = <T,>(n: number, v: T) => Array.from({ length: n }, () => v);

describe('carga de nieve por viento', () => {
  it('viento fuerte del oeste después de nevar: carga del oeste', () => {
    const dir = repeat(72, 265);
    const speed = repeat(72, 12);
    const snow = [...repeat(10, 1), ...repeat(62, 0)];
    expect(windLoadFrom(dir, speed, snow)).toEqual([270]);
  });

  it('sin nieve nueva, o con viento flojo, no hay carga', () => {
    expect(windLoadFrom(repeat(72, 270), repeat(72, 15), repeat(72, 0))).toEqual([]);
    expect(windLoadFrom(repeat(72, 270), repeat(72, 3), repeat(72, 1))).toEqual([]);
  });

  it('el viento antes de que nieve no cuenta', () => {
    // 60 h de viento del norte sin nieve, después nieva y sopla del sur 12 h.
    const dir = [...repeat(60, 0), ...repeat(12, 180)];
    const snow = [...repeat(60, 0), ...repeat(12, 1)];
    expect(windLoadFrom(dir, repeat(72, 10), snow)).toEqual([180]);
  });

  it('dos rumbos importantes: los dos', () => {
    const dir = [...repeat(36, 270), ...repeat(36, 225)];
    expect(windLoadFrom(dir, repeat(72, 10), repeat(72, 0.5))).toEqual([225, 270]);
  });

  it('sin datos de viento: null', () => {
    expect(windLoadFrom([], [], [])).toBeNull();
    expect(windLoadFrom(repeat(5, null), repeat(5, null), repeat(5, 0))).toBeNull();
  });

  it('habitual: días con nieve del histórico', () => {
    const n = 40;
    const dir = [...repeat(n, 250), ...repeat(n, 90)];
    const speed = [...repeat(n, 8), ...repeat(n, 8)];
    const snow = [...repeat(n, 2), ...repeat(n, 0)]; // del este nunca nieva (salvo el día siguiente a una nevada)
    expect(prevailingFrom(dir, speed, snow)).toEqual([270]);
    expect(prevailingFrom(repeat(5, 270), repeat(5, 8), repeat(5, 1))).toBeNull();
  });

  it('sotavento: las laderas que miran hacia donde sopla', () => {
    const lee = leeAspects([270]);
    expect(lee).toEqual([90]);
    expect(isLee(90, lee)).toBe(true);
    expect(isLee(140, lee)).toBe(true);
    expect(isLee(160, lee)).toBe(false);
    expect(isLee(270, lee)).toBe(false);
    // Alrededor del norte.
    expect(isLee(350, leeAspects([180]))).toBe(true);
  });

  it('nombres de los rumbos', () => {
    expect(compassList([225, 270], 'es')).toBe('SO y O');
    expect(compassList([270], 'en')).toBe('W');
  });

  it('el histórico de Open-Meteo está en otro servidor', () => {
    expect(archiveBase('https://api.open-meteo.com/')).toBe('https://archive-api.open-meteo.com');
    expect(archiveBase('http://meteo.local:8080')).toBe('http://meteo.local:8080');
  });
});

describe('qué viento usar', () => {
  const start = Date.UTC(2026, 6, 1);
  const n = 10 * 24;
  const series: FreezingSeries = {
    start,
    at: start,
    values: repeat(n, 1500),
    windDir: repeat(n, 270),
    windSpeed: repeat(n, 12),
    snow: repeat(n, 0.2),
  };
  const zone = { name: 'Catedral', lat: -41.17, lon: -71.44, radiusKm: 20, freezing: series, prevailing: { from: [225], at: start } };
  const now = start + 5 * 24 * H;

  it('con la serie guardada de la zona, la carga reciente', () => {
    expect(windLoadAt(series, now)).toEqual([270]);
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, null, [zone], now)).toEqual({ recent: { from: [270], at: start, zone: 'Catedral' }, usual: { source: 'prevailing', from: [225], zone: 'Catedral' } });
  });

  it('con la consulta reciente del lugar, esa', () => {
    const live = { meters: 1500, freezingMin: 1800, lat: -41.2, lon: -71.4, at: now - H, windFrom: [] };
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, { ...live, windFrom: [225] }, [zone], now)).toEqual({ recent: { from: [225], at: now - H }, usual: { source: 'prevailing', from: [225], zone: 'Catedral' } });
  });

  it('sin carga reciente: el habitual igual, por separado', () => {
    const live = { meters: 1500, freezingMin: 1800, lat: -41.2, lon: -71.4, at: now - H, windFrom: [] };
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, live, [zone], now)).toEqual({ recent: { from: [], at: now - H }, usual: { source: 'prevailing', from: [225], zone: 'Catedral' } });
    // Sin zona descargada: el habitual del lugar, si se pidió; si no, del oeste.
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, { ...live, prevailing: [315] }, [], now)).toEqual({ recent: { from: [], at: now - H }, usual: { source: 'prevailing', from: [315] } });
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, live, [], now)).toEqual({ recent: { from: [], at: now - H }, usual: { source: 'default', from: [270] } });
    // Con la serie de la zona sin carga (sin nieve).
    const calm = { ...zone, freezing: { ...series, snow: repeat(n, 0) } };
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, null, [calm], now)).toEqual({ recent: { from: [], at: start, zone: 'Catedral' }, usual: { source: 'prevailing', from: [225], zone: 'Catedral' } });
  });

  it('el habitual del lugar se pide una vez, y solo sin zona con el suyo', async () => {
    const { needsLivePrevailing, carryPrevailing } = await import('./snowline');
    const live = { meters: 1500, freezingMin: 1800, lat: -41.2, lon: -71.4, at: now - H, windFrom: [] };
    expect(needsLivePrevailing({ lat: -41.2, lon: -71.4 }, live, [])).toBe(true);
    expect(needsLivePrevailing({ lat: -41.2, lon: -71.4 }, live, [zone])).toBe(false);
    // También con carga reciente: el habitual se marca igual.
    expect(needsLivePrevailing({ lat: -41.2, lon: -71.4 }, { ...live, windFrom: [270] }, [])).toBe(true);
    expect(needsLivePrevailing({ lat: -41.2, lon: -71.4 }, { ...live, prevailing: [] }, [])).toBe(false);
    // Al renovar en el mismo lugar se conserva; en otro, no.
    expect(carryPrevailing({ ...live, prevailing: [315] }, live).prevailing).toEqual([315]);
    expect(carryPrevailing({ ...live, prevailing: [315] }, { ...live, lat: -32.6 }).prevailing).toBeUndefined();
  });

  it('pronóstico vencido: el habitual; lejos de todo: del oeste', () => {
    expect(chooseWind({ lat: -41.2, lon: -71.4 }, null, [zone], start + 30 * 24 * H)).toEqual({ recent: null, usual: { source: 'prevailing', from: [225], zone: 'Catedral' } });
    expect(chooseWind({ lat: -32.65, lon: -70 }, null, [zone], now)).toEqual({ recent: null, usual: { source: 'default', from: [270] } });
  });

  it('la limpieza recorta también el viento', () => {
    const pruned = pruneSeries(series, now)!;
    expect(pruned.windDir!.length).toBe(pruned.values.length);
    expect(pruned.snow!.length).toBe(pruned.values.length);
  });
});

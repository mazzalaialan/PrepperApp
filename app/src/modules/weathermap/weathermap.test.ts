import { describe, expect, it } from 'vitest';
import { fitBounds, fromMercator, project, REGION_BOUNDS, tileBBox, tilesFor, toMercator, unproject, zoomAt } from './projection';
import { fireDays, frameTimes, parseHazards, parseQuakes, parseZoneWeather, zoneWeatherUrl } from './sources';

describe('proyección Mercator', () => {
  it('ida y vuelta', () => {
    const m = toMercator(-58.38, -34.6);
    const back = fromMercator(m.x, m.y);
    expect(back.lon).toBeCloseTo(-58.38, 6);
    expect(back.lat).toBeCloseTo(-34.6, 6);
  });

  it('la vista inicial muestra los tres países completos', () => {
    const size = { width: 360, height: 600 };
    const view = fitBounds(REGION_BOUNDS, size);
    for (const [lon, lat] of [[-73.5, -54.9], [-53.3, -33.7], [-68.6, -22.0]]) {
      const p = project(lon!, lat!, view, size);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(size.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(size.height);
    }
  });

  it('el zoom deja fijo el punto bajo el dedo', () => {
    const size = { width: 400, height: 600 };
    const view = fitBounds(REGION_BOUNDS, size);
    const before = unproject(100, 200, view, size);
    const after = unproject(100, 200, zoomAt(view, size, 2, 100, 200), size);
    expect(after.lon).toBeCloseTo(before.lon, 6);
    expect(after.lat).toBeCloseTo(before.lat, 6);
  });

  it('teselas: cubren la vista y sus límites coinciden con la grilla', () => {
    const size = { width: 400, height: 600 };
    const view = fitBounds(REGION_BOUNDS, size);
    const tiles = tilesFor(view, size, 4);
    expect(tiles.length).toBeGreaterThan(0);
    const ba = toMercator(-58.38, -34.6);
    expect(tiles.some((t) => {
      const b = tileBBox(t.x, t.y, t.z);
      return ba.x >= b.minX && ba.x <= b.maxX && ba.y >= b.minY && ba.y <= b.maxY;
    })).toBe(true);
  });
});

describe('fuentes', () => {
  it('animación: 13 imágenes cada 10 minutos, de la más vieja a la última', () => {
    const times = frameTimes(new Date('2026-10-31T15:00:00Z'));
    expect(times).toHaveLength(13);
    expect(times[0]!.toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(times.at(-1)!.toISOString()).toBe('2026-10-31T15:00:00.000Z');
  });

  it('focos de calor: ayer y hoy (UTC)', () => {
    expect(fireDays(new Date('2026-10-31T02:00:00Z'))).toEqual(['2026-10-30', '2026-10-31']);
  });

  it('sismos: solo la región, los más nuevos primero', () => {
    const f = (id: string, lon: number, lat: number, time: number) => ({
      id,
      properties: { mag: 4.1, place: id, time, url: `https://x/${id}` },
      geometry: { coordinates: [lon, lat, 30] as [number, number, number] },
    });
    const quakes = parseQuakes({ features: [f('japon', 140, 35, 3), f('mendoza', -68.8, -32.9, 1), f('chile', -71, -30, 2)] });
    expect(quakes.map((q) => q.id)).toEqual(['chile', 'mendoza']);
    expect(quakes[0]).toMatchObject({ depthKm: 30, mag: 4.1 });
  });

  it('GDACS: tipos útiles dentro de la región (los sismos vienen de USGS)', () => {
    const f = (type: string, lon: number, lat: number, level = 'Orange') => ({
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { eventtype: type, eventid: 1, episodeid: 1, name: `${type} test`, alertlevel: level, fromdate: '2026-10-30T00:00:00', todate: '2026-10-31T00:00:00' },
    });
    const hazards = parseHazards({ features: [f('WF', -64, -27), f('EQ', -70, -30), f('TC', 140, 20), f('FL', -58, -34, 'Weird')] });
    expect(hazards.map((h) => [h.type, h.level])).toEqual([['WF', 'Orange'], ['FL', 'Green']]);
  });

  it('clima por zona: una consulta con todos los puntos, en el mismo orden', () => {
    const points = [{ name: 'A', lon: -58.4, lat: -34.6 }, { name: 'B', lon: -64.2, lat: -31.4 }];
    expect(zoneWeatherUrl('https://api.open-meteo.com/', points)).toContain('latitude=-34.600%2C-31.400');
    const cur = (temp: number | null) => ({ current: { temperature_2m: temp, precipitation: 0.2, weather_code: 61, wind_speed_10m: 12, wind_direction_10m: 90, wind_gusts_10m: 30 } });
    expect(parseZoneWeather([cur(21), cur(null)], points).map((z) => [z.name, z.temp])).toEqual([['A', 21]]);
    expect(parseZoneWeather(cur(18), points.slice(0, 1))[0]).toMatchObject({ name: 'A', temp: 18, precip: 0.2 });
  });
});

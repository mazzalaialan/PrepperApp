import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveContains, archiveCovers, fetchTile, resetMapSources, serverIsDown, setMapSourceConfig, type MapSourceMode, type ServerMaps } from './sources';
import { planZone, zoneSource } from './tiles';

const SERVER = 'https://mi.servidor';
const AR_CL_UY: [number, number, number, number] = [-76, -56, -53, -17.4];
const maps: ServerMaps = {
  vector: { minZoom: 0, maxZoom: 14, bounds: AR_CL_UY, updatedAt: '2026-11-01T00:00:00Z' },
  elevation: { minZoom: 0, maxZoom: 12, bounds: AR_CL_UY, updatedAt: '2026-11-01T00:00:00Z' },
  maxZoneTiles: 60_000,
  maxZoneMb: 1_500,
};
/** Bariloche, zoom 14. */
const BARILOCHE = { z: 14, x: 4946, y: 9873 };

type Reply = { status: number; body?: string; headers?: Record<string, string> };
let replies: (url: string) => Reply | Error;
let calls: string[];

beforeEach(() => {
  resetMapSources();
  calls = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    calls.push(url);
    if (url === `${SERVER}/api/maps`) return new Response(JSON.stringify(maps), { status: 200 });
    if (url === 'https://tiles.openfreemap.org/planet') return new Response(JSON.stringify({ tiles: ['https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf'] }));
    const r = replies(url);
    if (r instanceof Error) throw r;
    return new Response(r.status === 204 ? null : (r.body ?? 'x'), { status: r.status, headers: r.headers ?? {} });
  });
});
afterEach(() => vi.unstubAllGlobals());

const use = (mode: MapSourceMode, serverUrl = SERVER) => setMapSourceConfig(() => ({ serverUrl, mode }));
const text = (b: ArrayBuffer | null) => (b ? new TextDecoder().decode(b) : null);
const { z, x, y } = BARILOCHE;

describe('fuente de las teselas', () => {
  it('automático: primero el servidor propio', async () => {
    use('auto');
    replies = (url) => (url.startsWith(SERVER) ? { status: 200, body: 'propia' } : { status: 200, body: 'pública' });
    const r = await fetchTile('vector', z, x, y);
    expect(r.from).toBe('server');
    expect(text(r.data)).toBe('propia');
    expect(calls).toContain(`${SERVER}/api/maps/vector/${z}/${x}/${y}`);
  });

  it('automático: si el servidor está sobrecargado usa las públicas y lo deja de lado un rato', async () => {
    use('auto');
    replies = (url) => (url.startsWith(SERVER) ? { status: 503, headers: { 'retry-after': '30' } } : { status: 200, body: 'pública' });
    const r = await fetchTile('dem', 12, 1236, 2468);
    expect(r.from).toBe('public');
    expect(calls.at(-1)).toBe('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1236/2468.png');
    expect(serverIsDown()).toBe(true);
    // La siguiente ya ni lo intenta.
    calls = [];
    await fetchTile('vector', z, x, y);
    expect(calls.some((c) => c.startsWith(`${SERVER}/api/maps/`))).toBe(false);
  });

  it('automático: si el servidor no contesta, las públicas', async () => {
    use('auto');
    replies = (url) => (url.startsWith(SERVER) ? new TypeError('network') : { status: 200, body: 'pública' });
    expect((await fetchTile('vector', z, x, y)).from).toBe('public');
  });

  it('fuera de la zona del servidor va directo a las públicas', async () => {
    use('auto');
    replies = () => ({ status: 200, body: 'pública' });
    // Madrid
    const r = await fetchTile('vector', 14, 8015, 6200);
    expect(r.from).toBe('public');
    expect(calls.some((c) => c.startsWith(`${SERVER}/api/maps/vector`))).toBe(false);
  });

  it('204 del servidor (mar): sin datos, no se busca en otro lado', async () => {
    use('auto');
    replies = (url) => (url.startsWith(SERVER) ? { status: 204 } : { status: 200 });
    expect(await fetchTile('vector', z, x, y)).toEqual({ data: null, from: 'server' });
  });

  it('solo mi servidor: si falla, no usa las públicas', async () => {
    use('server');
    replies = (url) => (url.startsWith(SERVER) ? { status: 503 } : { status: 200 });
    await expect(fetchTile('vector', z, x, y)).rejects.toThrow();
    expect(calls.some((c) => c.includes('openfreemap'))).toBe(false);
  });

  it('solo públicas: no le pregunta nada al servidor', async () => {
    use('public');
    replies = () => ({ status: 200, body: 'pública' });
    expect((await fetchTile('vector', z, x, y)).from).toBe('public');
    expect(calls.some((c) => c.startsWith(SERVER))).toBe(false);
  });

  it('cobertura del archivo del servidor por zoom y por zona', () => {
    expect(archiveCovers(maps.vector, z, x, y)).toBe(true);
    expect(archiveCovers(maps.elevation, 13, 2473, 4936)).toBe(false);
    expect(archiveContains(maps.vector, { west: -72, south: -42, east: -70, north: -40 }, 14)).toBe(true);
    expect(archiveContains(maps.vector, { west: -80, south: -42, east: -70, north: -40 }, 14)).toBe(false);
  });
});

describe('de dónde se baja una zona', () => {
  const small = planZone(-41.13, -71.31, 5, 14);
  const big = planZone(-41.13, -71.31, 50, 14);
  const huge = planZone(-41.13, -71.31, 200, 14);

  it('con el servidor: zonas más grandes que el límite público', () => {
    expect(big.withinLimits).toBe(false);
    expect(zoneSource(big, maps, 'auto')).toEqual({ ok: true, from: 'server', vectorPublic: false });
    // Si entra en el límite público, en automático puede completar con las públicas.
    expect(zoneSource(small, maps, 'auto')).toEqual({ ok: true, from: 'server', vectorPublic: true });
    expect(zoneSource(small, maps, 'server')).toEqual({ ok: true, from: 'server', vectorPublic: false });
  });

  it('demasiado incluso para el servidor', () => {
    expect(zoneSource(huge, maps, 'auto')).toEqual({ ok: false, reason: 'tooBigServer' });
  });

  it('sin servidor: el límite público de siempre', () => {
    expect(zoneSource(small, null, 'auto')).toEqual({ ok: true, from: 'public', vectorPublic: true });
    expect(zoneSource(big, null, 'auto')).toEqual({ ok: false, reason: 'tooBig' });
    expect(zoneSource(small, maps, 'public')).toEqual({ ok: true, from: 'public', vectorPublic: true });
    expect(zoneSource(small, null, 'server')).toEqual({ ok: false, reason: 'noServer' });
    const madrid = planZone(40.4, -3.7, 5, 14);
    expect(zoneSource(madrid, maps, 'server')).toEqual({ ok: false, reason: 'outsideServer' });
    expect(zoneSource(madrid, maps, 'auto')).toEqual({ ok: true, from: 'public', vectorPublic: true });
  });
});

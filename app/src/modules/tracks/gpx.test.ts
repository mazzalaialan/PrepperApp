import { describe, expect, it } from 'vitest';
import { GpxError, parseGpx, simplify, trackStats, type TrackPoint } from './gpx';
import { trackFromGpx } from './store';

/** Como lo exporta Wikiloc: metadata con link, un track y puntos con nombre. */
const WIKILOC = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Wikiloc - https://www.wikiloc.com" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Wikiloc - Refugio Frey desde Villa Catedral</name>
    <link href="https://es.wikiloc.com/rutas-senderismo/refugio-frey-123456"><text>Refugio Frey en Wikiloc</text></link>
    <time>2025-01-10T12:00:00Z</time>
  </metadata>
  <wpt lat="-41.1700" lon="-71.4400"><ele>1700</ele><name>Refugio Frey</name><desc><![CDATA[Refugio con <b>agua</b> &amp; camping]]></desc></wpt>
  <wpt lat="-41.1650" lon="-71.4300"><ele>1300</ele><name>Arroyo</name></wpt>
  <trk>
    <name>Refugio Frey desde Villa Catedral</name>
    <desc>Subida por el sendero del Cerro Catedral.</desc>
    <trkseg>
      <trkpt lat="-41.1600" lon="-71.4200"><ele>1000</ele><time>2025-01-10T12:00:00Z</time></trkpt>
      <trkpt lat="-41.1620" lon="-71.4240"><ele>1003</ele></trkpt>
      <trkpt lat="-41.1640" lon="-71.4280"><ele>1150</ele></trkpt>
      <trkpt lat="-41.1660" lon="-71.4320"><ele>1300</ele></trkpt>
      <trkpt lat="-41.1680" lon="-71.4360"><ele>1290</ele></trkpt>
      <trkpt lat="-41.1700" lon="-71.4400"><ele>1700</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe('GPX de Wikiloc', () => {
  it('lee el recorrido, los puntos con nombre y el link a Wikiloc', () => {
    const t = parseGpx(WIKILOC, 'frey.gpx');
    expect(t.name).toBe('Refugio Frey desde Villa Catedral');
    expect(t.desc).toBe('Subida por el sendero del Cerro Catedral.');
    expect(t.link).toBe('https://es.wikiloc.com/rutas-senderismo/refugio-frey-123456');
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0]).toHaveLength(6);
    expect(t.segments[0]![0]).toEqual([-41.16, -71.42, 1000]);
    expect(t.waypoints.map((w) => w.name)).toEqual(['Refugio Frey', 'Arroyo']);
    expect(t.waypoints[0]).toMatchObject({ ele: 1700, desc: 'Refugio con agua & camping' });
  });

  it('distancia y desnivel (sin sumar el ruido de menos de 5 m)', () => {
    const s = trackStats(parseGpx(WIKILOC).segments);
    expect(s.distanceM).toBeGreaterThan(2000);
    expect(s.distanceM).toBeLessThan(2400);
    // 1000 → 1150 → 1300 (+300), baja 10 (−10), sube a 1700 (+410); el +3 del principio no cuenta.
    expect(s.ascentM).toBe(710);
    expect(s.descentM).toBe(10);
    expect(s).toMatchObject({ minEle: 1000, maxEle: 1700 });
  });

  it('acepta rutas (rte) y archivos sin altura; rechaza lo que no es GPX', () => {
    const rte = `<gpx><rte><name>Ruta</name><rtept lat="-34.6" lon="-58.4"/><rtept lat="-34.61" lon="-58.41"/></rte></gpx>`;
    const t = parseGpx(rte);
    expect(t.name).toBe('Ruta');
    expect(t.segments[0]).toEqual([
      [-34.6, -58.4, null],
      [-34.61, -58.41, null],
    ]);
    expect(trackStats(t.segments)).toMatchObject({ ascentM: 0, minEle: null });
    expect(() => parseGpx('<kml></kml>')).toThrow(GpxError);
    expect(() => parseGpx('<gpx></gpx>')).toThrow(GpxError);
  });

  it('simplifica una línea recta llena de puntos sin cambiar su forma', () => {
    const line: TrackPoint[] = Array.from({ length: 1000 }, (_, i) => [-41 + i * 0.0001, -71 + i * 0.0001, null]);
    const curve: TrackPoint[] = [...line, [-40.9, -71.2, null]];
    expect(simplify(line)).toHaveLength(2);
    const s = simplify(curve);
    expect(s[0]).toEqual(curve[0]);
    expect(s.at(-1)).toEqual([-40.9, -71.2, null]);
    expect(s.length).toBeLessThan(5);
  });
});

describe('track importado', () => {
  it('de Wikiloc: sin el prefijo "Wikiloc - ", con la fuente y el recorrido simplificado', () => {
    const t = trackFromGpx(WIKILOC, 'frey.gpx');
    expect(t).toMatchObject({ name: 'Refugio Frey desde Villa Catedral', source: 'Wikiloc', ascentM: 710, notes: '' });
    expect(t.segments[0]!.length).toBeLessThanOrEqual(6);
    expect(t.waypoints).toHaveLength(2);
  });

  it('de otra app: la fuente es el nombre del archivo', () => {
    const gpx = `<gpx creator="OsmAnd"><trk><name>Vuelta al lago</name><trkseg><trkpt lat="-41" lon="-71"/><trkpt lat="-41.01" lon="-71.01"/></trkseg></trk></gpx>`;
    expect(trackFromGpx(gpx, 'lago.gpx')).toMatchObject({ name: 'Vuelta al lago', source: 'lago.gpx' });
  });
});

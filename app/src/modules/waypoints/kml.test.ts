import { gzipSync, strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { KmlError, kmlTextFromBytes, parseKml, toKml } from './kml';
import type { Track } from '@/core/model/types';
import { GpxError } from '@/modules/tracks/gpx';
import { trackFromBytes } from '@/modules/tracks/importTrack';
import { routeFromTrack } from './importRoute';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>Cerro Platita &amp; laguna</name>
  <Placemark><name>Refugio</name><description><![CDATA[<b>Agua</b> y leña]]></description><Point><coordinates>-69.1,-32.9,2100</coordinates></Point></Placemark>
  <Folder>
    <Placemark><name>Subida</name><LineString><tessellate>1</tessellate>
      <coordinates>
        -69.10,-32.90,2000 -69.11,-32.91,2100
        -69.12,-32.92,2200
      </coordinates></LineString></Placemark>
    <Placemark><name>Google Earth</name><gx:Track>
      <when>2026-11-01T10:00:00Z</when><when>2026-11-01T10:01:00Z</when>
      <gx:coord>-69.2 -32.9 100</gx:coord><gx:coord>-69.21 -32.91 110</gx:coord>
    </gx:Track></Placemark>
  </Folder>
</Document></kml>`;

describe('KML', () => {
  it('lee líneas (lon,lat,alt: primero la longitud), tracks de Google Earth y puntos con nombre', () => {
    const k = parseKml(KML, 'x.kml');
    expect(k.name).toBe('Cerro Platita & laguna');
    expect(k.segments).toHaveLength(2);
    expect(k.segments[0]).toEqual([[-32.9, -69.1, 2000], [-32.91, -69.11, 2100], [-32.92, -69.12, 2200]]);
    // gx:Track: coordenadas separadas por espacio y con hora.
    expect(k.segments[1]![0]).toEqual([-32.9, -69.2, 100, Date.parse('2026-11-01T10:00:00Z') / 1000]);
    expect(k.points).toEqual([{ name: 'Refugio', lat: -32.9, lon: -69.1, ele: 2100, desc: 'Agua y leña' }]);
  });
  it('rechaza lo que no es KML o no trae nada', () => {
    expect(() => parseKml('<gpx></gpx>')).toThrow(KmlError);
    expect(() => parseKml('<kml><Document><name>x</name></Document></kml>')).toThrow(KmlError);
  });
  it('ignora coordenadas fuera de rango', () => {
    const k = parseKml('<kml><Placemark><LineString><coordinates>-69,-32,0 400,95,0 -69.1,-32.1,0</coordinates></LineString></Placemark></kml>');
    expect(k.segments[0]).toHaveLength(2);
  });
  it('KMZ: abre el zip y toma doc.kml (o el primer .kml)', () => {
    const kmz = zipSync({ 'otro.txt': strToU8('hola'), 'doc.kml': strToU8(KML) });
    expect(kmlTextFromBytes(kmz)).toContain('Cerro Platita');
    expect(parseKml(kmlTextFromBytes(zipSync({ 'carpeta/ruta.kml': strToU8(KML) }))).segments).toHaveLength(2);
    expect(() => kmlTextFromBytes(zipSync({ 'nada.txt': strToU8('x') }))).toThrow(KmlError);
  });
  it('exporta y se vuelve a leer igual (con nombres escapados)', () => {
    const line = [{ lat: -41, lon: -71, ele: 10 }, { lat: -41.1, lon: -71.1, ele: null }];
    const back = parseKml(toKml('Ida & "vuelta" <1>', line, [{ name: 'Casa', lat: -41, lon: -71 }]));
    expect(back.name).toBe('Ida & "vuelta" <1>');
    expect(back.segments[0]).toEqual([[-41, -71, 10], [-41.1, -71.1, 0]]);
    expect(back.points[0]).toMatchObject({ name: 'Casa', lat: -41, lon: -71 });
  });
});

describe('importar un recorrido de un archivo (Tracks)', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('KML y KMZ: un track con la línea unida y los puntos con nombre dentro del track (no como lugares)', () => {
    const t = trackFromBytes(enc(KML), 'platita.kml');
    expect(t.name).toBe('Cerro Platita & laguna');
    expect(t.segments).toHaveLength(2);
    expect(t.waypoints.map((w) => w.name)).toEqual(['Refugio']);
    expect(t.distanceM).toBeGreaterThan(0);
    expect(trackFromBytes(zipSync({ 'doc.kml': strToU8(KML) }), 'platita.kmz').segments).toHaveLength(2);
  });
  it('GPX, TCX y .gz', () => {
    const gpx = '<gpx><trk><name>Wikiloc - Sendero</name><trkseg><trkpt lat="-41" lon="-71"><ele>10</ele></trkpt><trkpt lat="-41.01" lon="-71.01"><ele>20</ele></trkpt></trkseg></trk></gpx>';
    expect(trackFromBytes(enc(gpx), 'sendero.gpx').name).toBe('Sendero');
    const tcx = '<TrainingCenterDatabase><Courses><Course><Track><Trackpoint><Position><LatitudeDegrees>-41</LatitudeDegrees><LongitudeDegrees>-71</LongitudeDegrees></Position></Trackpoint><Trackpoint><Position><LatitudeDegrees>-41.02</LatitudeDegrees><LongitudeDegrees>-71.02</LongitudeDegrees></Position></Trackpoint></Track></Course></Courses></TrainingCenterDatabase>';
    expect(trackFromBytes(enc(tcx), 'curso.tcx').segments[0]).toHaveLength(2);
    expect(trackFromBytes(gzipSync(enc(gpx)), 'sendero.gpx.gz').segments[0]).toHaveLength(2);
  });
  it('un archivo que no sirve da un error claro', () => {
    expect(() => trackFromBytes(enc('hola'), 'x.txt')).toThrow(GpxError);
    expect(() => trackFromBytes(enc('<kml><Placemark><Point><coordinates>-69,-32,0</coordinates></Point></Placemark></kml>'), 'x.kml')).not.toThrow(); // un KML con solo puntos
    expect(() => trackFromBytes(enc('<kml><Document/></kml>'), 'x.kml')).toThrow(GpxError);
  });
});

describe('de un track a una ruta planificada', () => {
  it('toma la línea del track, unida y simplificada', () => {
    const seg: [number, number, number | null][] = Array.from({ length: 5000 }, (_, i) => [-41 + i * 0.0001, -71 + Math.sin(i / 50) * 0.01, null]);
    const route = routeFromTrack({ name: 'Mi salida', segments: [seg] } as unknown as Track)!;
    expect(route.name).toBe('Mi salida');
    expect(route.waypointIds).toEqual([]);
    expect(route.line!.length).toBeLessThanOrEqual(400);
    expect(route.line![0]).toEqual({ lat: -41, lon: -71 });
    expect(routeFromTrack({ name: 'x', segments: [[]] } as unknown as Track)).toBeNull();
  });
});

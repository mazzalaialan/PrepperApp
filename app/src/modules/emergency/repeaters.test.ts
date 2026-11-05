import { describe, expect, it } from 'vitest';
import { mergeRepeaters, parseRepeaterCsv, parseRepeaterXml, repeaterSummary } from './repeaters';

describe('importar repetidoras', () => {
  it('CSV con coordenadas (estilo RepeaterBook)', () => {
    const csv = [
      'Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,Location,State,Country,Lat,Long,Use,Op Status,Mode',
      '146.970,146.370,-0.600,100.0,,LU2FCF,Rosario,Santa Fe,Argentina,-32.9468,-60.6393,OPEN,On-Air,FM',
      '438.500,433.500,-5.000,,,LU1ABC,Bariloche,Río Negro,Argentina,-41.13,-71.31,OPEN,Off-Air,DMR',
      'no es una frecuencia,,,,,X,,,,,,,,',
    ].join('\n');
    const [a, b] = parseRepeaterCsv(csv);
    expect(a).toMatchObject({ call: 'LU2FCF', location: 'Rosario', output: 146.97, offset: -0.6, tone: 100, lat: -32.9468, lon: -60.6393, status: 'On-Air', mode: 'FM' });
    expect(b).toMatchObject({ call: 'LU1ABC', offset: -5, tone: null, status: 'Off-Air', mode: 'DMR' });
    expect(parseRepeaterCsv(csv)).toHaveLength(2);
  });

  it('CSV de CHIRP: desplazamiento según Duplex, tono solo si está activo, sin coordenadas', () => {
    const csv = [
      'Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment',
      '0,LU7DOT,145.210000,-,0.600000,Tone,88.5,88.5,023,NN,FM,5.00,,Mar del Plata',
      '1,SIMPLEX,146.520000,,0.000000,,88.5,88.5,023,NN,FM,5.00,,',
    ].join('\n');
    const [a, b] = parseRepeaterCsv(csv);
    expect(a).toMatchObject({ call: 'LU7DOT', location: 'Mar del Plata', output: 145.21, offset: -0.6, tone: 88.5, lat: null });
    expect(b).toMatchObject({ output: 146.52, offset: null, tone: null });
  });

  it('GPX y KML: coordenadas y datos del texto', () => {
    const gpx = `<gpx><wpt lat="-34.6" lon="-58.4"><name>LU4AA 147.120+</name><desc>Buenos Aires PL 123.0</desc></wpt></gpx>`;
    expect(parseRepeaterXml(gpx)[0]).toMatchObject({ call: 'LU4AA', output: 147.12, offset: 0.6, tone: 123, lat: -34.6, lon: -58.4 });
    const kml = `<kml><Document><Placemark><name>LU1WP</name><description>146.910 MHz offset -0.6 tono 100.0 Trelew</description><Point><coordinates>-65.3,-43.25,0</coordinates></Point></Placemark></Document></kml>`;
    expect(parseRepeaterXml(kml)[0]).toMatchObject({ call: 'LU1WP', output: 146.91, offset: -0.6, tone: 100, lat: -43.25, lon: -65.3 });
  });

  it('importar otro archivo suma y actualiza (misma frecuencia e indicativo)', () => {
    const r = (call: string, output: number, status = '') => ({ call, location: '', output, offset: null, tone: null, mode: '', status, lat: null, lon: null });
    const merged = mergeRepeaters([r('LU1', 146.97), r('LU2', 147.0)], [r('LU1', 146.97, 'Off-Air'), r('LU3', 145.21)]);
    expect(merged).toHaveLength(3);
    expect(merged.find((x) => x.call === 'LU1')?.status).toBe('Off-Air');
  });

  it('resumen para programar el equipo', () => {
    expect(repeaterSummary({ call: 'X', location: '', output: 146.97, offset: -0.6, tone: 100, mode: '', status: '', lat: null, lon: null }, 'es')).toBe('146,970 MHz · −0,6 · T 100,0');
  });
});

describe('listado oficial de repetidoras (SUBTEL, Chile)', async () => {
  const { officialFor, withoutDuplicates } = await import('./officialRepeaters');
  const { readFileSync } = await import('node:fs');
  const list = JSON.parse(readFileSync(new URL('../../../public/data/repeaters-CL.json', import.meta.url), 'utf8'));

  it('el archivo trae las repetidoras con frecuencias, tono y ubicación en Chile', () => {
    expect(list.country).toBe('CL');
    expect(list.items.length).toBeGreaterThan(150);
    for (const r of list.items) {
      expect(r.output).toBeGreaterThan(140);
      expect([-0.6, 0.6, 5, -5]).toContain(r.offset);
      if (r.lat !== null) {
        expect(r.lat).toBeGreaterThan(-56);
        expect(r.lat).toBeLessThan(-17);
        expect(r.lon).toBeGreaterThan(-76);
        expect(r.lon).toBeLessThan(-66);
      }
      expect(r.expires).toMatch(/^\d{4}-\d\d-\d\d$/);
    }
  });

  it('con Chile se muestran todas; con Argentina solo las cercanas (cordillera)', () => {
    expect(officialFor([list], 'CL', null)).toHaveLength(list.items.length);
    expect(officialFor([list], 'AR', null)).toHaveLength(0);
    const puenteDelInca = { lat: -32.82, lon: -69.92 };
    const near = officialFor([list], 'AR', puenteDelInca);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(list.items.length);
    expect(officialFor([list], 'AR', { lat: -34.6, lon: -58.4 })).toHaveLength(0);
    expect(near[0]!.official?.country).toBe('CL');
  });

  it('una importada que repite una oficial no aparece dos veces', () => {
    const official = officialFor([list], 'CL', null);
    const first = official[0]!;
    const dup = { ...first, call: first.call.split(' ')[0]!, official: undefined };
    const other = { ...first, call: 'XQ1ZZZ', output: 145.11, official: undefined };
    const all = withoutDuplicates([dup, other], official);
    expect(all).toHaveLength(official.length + 1);
    expect(all.at(-1)!.call).toBe('XQ1ZZZ');
  });
});

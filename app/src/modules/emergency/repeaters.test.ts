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

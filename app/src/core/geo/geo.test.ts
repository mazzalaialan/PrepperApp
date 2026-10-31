import { describe, expect, it } from 'vitest';
import { bearingDeg, cardinalOf, distanceMeters, formatDecimal, formatDms, parseCoordinates } from './geo';

const obelisco = { lat: -34.603722, lon: -58.381592 };
const cordoba = { lat: -31.420083, lon: -64.188776 };

describe('distancia y rumbo', () => {
  it('Obelisco → Córdoba ≈ 646 km al NO', () => {
    expect(distanceMeters(obelisco, cordoba) / 1000).toBeCloseTo(646, -1);
    const b = bearingDeg(obelisco, cordoba);
    expect(b).toBeGreaterThan(295);
    expect(b).toBeLessThan(305);
    expect(cardinalOf(b)).toBe('NW');
  });

  it('rumbos cardinales exactos', () => {
    const o = { lat: 0, lon: 0 };
    expect(bearingDeg(o, { lat: 1, lon: 0 })).toBeCloseTo(0);
    expect(bearingDeg(o, { lat: 0, lon: 1 })).toBeCloseTo(90);
    expect(bearingDeg(o, { lat: -1, lon: 0 })).toBeCloseTo(180);
    expect(bearingDeg(o, { lat: 0, lon: -1 })).toBeCloseTo(270);
    expect(cardinalOf(359)).toBe('N');
    expect(cardinalOf(-90)).toBe('W');
  });

  it('distancia corta: 1′ de latitud ≈ 1852 m', () => {
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 1 / 60, lon: 0 })).toBeCloseTo(1853, -1);
  });
});

describe('parseCoordinates', () => {
  const close = (text: string, lat: number, lon: number) => {
    const r = parseCoordinates(text);
    expect(r, text).not.toBeNull();
    expect(r!.lat, text).toBeCloseTo(lat, 4);
    expect(r!.lon, text).toBeCloseTo(lon, 4);
  };

  it('decimal con punto (Google Maps), con y sin espacio', () => {
    close('-34.603722, -58.381592', -34.603722, -58.381592);
    close('-34.603722,-58.381592', -34.603722, -58.381592);
    close('  -34.6037   -58.3816 ', -34.6037, -58.3816);
  });

  it('decimal con coma', () => {
    close('-34,6037 -58,3816', -34.6037, -58.3816);
    close('-34,6037; -58,3816', -34.6037, -58.3816);
  });

  it('hemisferios detrás, delante y oeste en español', () => {
    close('34.6037 S 58.3816 W', -34.6037, -58.3816);
    close('34.6037S, 58.3816O', -34.6037, -58.3816);
    close('S 34.6037 O 58.3816', -34.6037, -58.3816);
    close('N 40.7128 W 74.006', 40.7128, -74.006);
  });

  it('grados, minutos y segundos', () => {
    close(`34°36'13.4"S 58°22'53.7"W`, -34.603722, -58.381583);
    close('34 36 13.4 S 58 22 53.7 O', -34.603722, -58.381583);
    close('34°36′13″ S 58°22′54″ O', -34.603611, -58.381667);
  });

  it('grados y minutos decimales', () => {
    close(`34°36.223'S 58°22.895'W`, -34.603717, -58.381583);
  });

  it('el orden de los hemisferios manda sobre la posición', () => {
    close('58.3816 W 34.6037 S', -34.6037, -58.3816);
  });

  it('rechaza lo inválido', () => {
    for (const bad of ['', 'hola', '-34.6', '95, 10', '10, 200', `34°75'S 58°10'W`, '34 S 35 S', '1 2 3']) {
      expect(parseCoordinates(bad), bad).toBeNull();
    }
  });
});

describe('formato', () => {
  it('decimal y GMS', () => {
    expect(formatDecimal(obelisco)).toBe('-34.603722, -58.381592');
    expect(formatDms(obelisco, 'O')).toBe('34°36′13.4″ S 58°22′53.7″ O');
  });

  it('GMS sin 60″ por redondeo', () => {
    expect(formatDms({ lat: 10.999999, lon: 0 })).toBe('11°00′00.0″ N 0°00′00.0″ E');
  });

  it('ida y vuelta GMS', () => {
    const back = parseCoordinates(formatDms(cordoba, 'O'))!;
    expect(back.lat).toBeCloseTo(cordoba.lat, 4);
    expect(back.lon).toBeCloseTo(cordoba.lon, 4);
  });
});

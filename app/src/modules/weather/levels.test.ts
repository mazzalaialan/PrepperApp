import { describe, expect, it } from 'vitest';
import { humidityLevel, pressureLevel, tempLevel, windLevel } from './levels';

describe('niveles de color del clima', () => {
  it('temperatura: bordes de cada tramo', () => {
    expect([-3, 0, 1, 10, 11, 24, 25, 29, 30, 34, 35].map((c) => tempLevel(c).key)).toEqual([
      'freezing', 'freezing', 'cold', 'cold', 'mild', 'mild', 'warm', 'warm', 'hot', 'hot', 'extreme',
    ]);
  });

  it('viento y ráfagas según Beaufort', () => {
    expect([0, 19, 20, 39, 40, 61, 62].map((k) => windLevel(k).key)).toEqual([
      'light', 'light', 'moderate', 'moderate', 'strong', 'strong', 'gale',
    ]);
  });

  it('humedad', () => {
    expect([20, 30, 60, 61, 80, 81].map((p) => humidityLevel(p).key)).toEqual(['dry', 'comfortable', 'comfortable', 'humid', 'humid', 'veryHumid']);
  });

  it('presión: baja con flecha abajo, alta con flecha arriba', () => {
    expect(pressureLevel(985)).toMatchObject({ key: 'veryLow', trend: 'down' });
    expect(pressureLevel(1000)).toMatchObject({ key: 'low', trend: 'down' });
    expect(pressureLevel(1013.2)).toMatchObject({ key: 'normal', trend: null });
    expect(pressureLevel(1028)).toMatchObject({ key: 'high', trend: 'up' });
  });
});

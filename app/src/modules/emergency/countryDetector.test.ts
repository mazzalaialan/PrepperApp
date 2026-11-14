import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cellKey, createCountryDetector, detectCountries, sameDetection, type DetectedCountries } from './countryDetector';

async function borders() {
  return (await import('./borders')).loadBorders();
}

describe('detección del país por la ubicación', () => {
  it('el país del lugar y los vecinos a menos de 50 km de su frontera', async () => {
    const b = await borders();
    expect(detectCountries(b, -31.42, -64.18)).toEqual({ country: 'AR', near: [] }); // Córdoba: lejos de toda frontera
    expect(detectCountries(b, -41.1335, -71.3103)).toEqual({ country: 'AR', near: ['CL'] }); // Bariloche: Chile está a menos de 50 km
    expect(detectCountries(b, -33.45, -70.66)?.country).toBe('CL'); // Santiago
    expect(detectCountries(b, -12.05, -77.04)).toMatchObject({ country: 'PE' }); // Lima
    expect(detectCountries(b, -16.5, -68.15)?.country).toBe('BO'); // La Paz
    // Villa La Angostura: a pocos km de Chile.
    expect(detectCountries(b, -40.76, -71.65)).toEqual({ country: 'AR', near: ['CL'] });
    // En el medio del Atlántico: ningún país.
    expect(detectCountries(b, -40, -30)).toBeNull();
  });

  it('la celda es de ~10 km y las comparaciones de resultados ignoran el orden de los vecinos', () => {
    expect(cellKey(-41.1335, -71.3103)).toBe(cellKey(-41.1001, -71.3499));
    expect(cellKey(-41.1335, -71.3103)).not.toBe(cellKey(-41.3, -71.3103));
    const a: DetectedCountries = { country: 'AR', near: ['CL', 'UY'] };
    expect(sameDetection(a, { country: 'AR', near: ['UY', 'CL'] })).toBe(true);
    expect(sameDetection(a, { country: 'AR', near: ['CL'] })).toBe(false);
    expect(sameDetection(a, { country: 'CL', near: ['CL', 'UY'] })).toBe(false);
    expect(sameDetection(null, a)).toBe(false);
  });
});

describe('detector: gasta lo mínimo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function setup(initial: DetectedCountries | null = null) {
    const b = await borders();
    let current = initial;
    const load = vi.fn(async () => b);
    const onChange = vi.fn((d: DetectedCountries) => {
      current = d;
    });
    const detector = createCountryDetector({ load, current: () => current, onChange, debounceMs: 1500 });
    return { detector, load, onChange };
  }

  it('espera a que la ubicación se calme: con muchos puntos seguidos calcula una sola vez, con el último', async () => {
    const { detector, load, onChange } = await setup();
    for (let i = 0; i < 20; i++) detector.note(-12.05 - i * 0.0001, -77.04);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].country).toBe('PE');
  });

  it('una ubicación en la misma celda no vuelve a calcular ni a avisar; en otra celda del mismo país, calcula pero no avisa', async () => {
    const { detector, load, onChange } = await setup();
    detector.note(-12.04, -77.04);
    await vi.advanceTimersByTimeAsync(1600);
    expect(onChange).toHaveBeenCalledTimes(1);
    detector.note(-12.03, -77.03); // misma celda de 10 km
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);
    detector.note(-12.6, -76.6); // otra celda, sigue en Perú: no hay cambio
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('avisa cuando cambia el país', async () => {
    const { detector, onChange } = await setup({ country: 'AR', near: [] });
    detector.note(-31.42, -64.18); // Córdoba: igual que lo guardado
    await vi.advanceTimersByTimeAsync(1600);
    expect(onChange).not.toHaveBeenCalled();
    detector.note(-12.05, -77.04); // Lima
    await vi.advanceTimersByTimeAsync(1600);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].country).toBe('PE');
  });

  it('si las fronteras no cargan, no avisa y reintenta con la próxima ubicación', async () => {
    const b = await borders();
    let calls = 0;
    const onChange = vi.fn();
    const detector = createCountryDetector({
      load: async () => {
        if (++calls === 1) throw new Error('sin fronteras');
        return b;
      },
      current: () => null,
      onChange,
      debounceMs: 100,
    });
    detector.note(-12.05, -77.04);
    await vi.advanceTimersByTimeAsync(200);
    expect(onChange).not.toHaveBeenCalled();
    detector.note(-12.05, -77.04);
    await vi.advanceTimersByTimeAsync(200);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

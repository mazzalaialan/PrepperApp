import { describe, expect, it } from 'vitest';
import { DRY_RESET_MS, nextEpisode, rainLevel, type RainEpisode } from './rainEpisode';

describe('episodio de lluvia (no repetir el aviso)', () => {
  const rain = (peakMmH: number) => ({ state: 'raining' as const, mm: 1, peakMmH });
  const dry = { state: 'dry' as const };
  it('niveles por intensidad', () => {
    expect([1, 2.5, 8, 60].map(rainLevel)).toEqual([1, 2, 3, 4]);
  });
  it('avisa al empezar, no al volver después de un rato seco, sí si se intensifica, y de nuevo después de 3 horas secas', () => {
    let ep: RainEpisode | null = null;
    const step = (o: Parameters<typeof nextEpisode>[1], t: number) => {
      const r = nextEpisode(ep, o, t);
      ep = r.episode;
      return r.notify;
    };
    expect(step(rain(1), 0)).toBe('new');
    expect(step(dry, 15 * 60_000)).toBeNull();
    expect(step(rain(1), 30 * 60_000)).toBeNull();
    expect(step(rain(10), 45 * 60_000)).toBe('stronger');
    expect(step(rain(10), 60 * 60_000)).toBeNull();
    expect(step(dry, 2 * 3_600_000)).toBeNull();
    expect(step(dry, 2 * 3_600_000 + DRY_RESET_MS)).toBeNull();
    expect(ep).toBeNull();
    expect(step(rain(1), 6 * 3_600_000)).toBe('new');
  });
});

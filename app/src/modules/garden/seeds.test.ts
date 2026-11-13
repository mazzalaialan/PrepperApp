import { describe, expect, it } from 'vitest';
import { CROPS } from './crops';
import type { SeedInfo } from './seeds';
import seeds from './seeds.json';

const data = seeds as unknown as Record<string, SeedInfo>;
const LIMITS = { why: 200, cycleNote: 130, isolationNote: 170, harvest: 260, dry: 320, hybrids: 140, caveat: 200, argentina: 170 } as const;

describe('guardar semilla propia', () => {
  it('hay una ficha por cada cultivo y ninguna de más', () => {
    expect(Object.keys(data).sort()).toEqual(CROPS.map((c) => c.id).sort());
  });

  it('valores válidos, textos en español e inglés dentro de su largo y sin etiquetas de cita', () => {
    for (const [id, s] of Object.entries(data)) {
      expect(['easy', 'medium', 'hard', 'no'], id).toContain(s.level);
      expect(['annual', 'biennial', 'vegetative', 'perennial'], id).toContain(s.cycle);
      expect(['self', 'insects', 'wind', 'mixed', 'vegetative'], id).toContain(s.pollination);
      expect(['high', 'medium', 'low'], id).toContain(s.confidence);
      for (const [k, max] of Object.entries(LIMITS)) {
        const v = (s as unknown as Record<string, { es: string; en: string } | null | undefined>)[k];
        if (!v) {
          expect(['isolationNote', 'caveat', 'argentina'], `${id}.${k} no puede faltar`).toContain(k);
          continue;
        }
        for (const lang of ['es', 'en'] as const) {
          expect(v[lang].trim().length, `${id}.${k}.${lang} vacío`).toBeGreaterThan(8);
          expect(v[lang].length, `${id}.${k}.${lang} pasa de ${max}`).toBeLessThanOrEqual(max);
          expect(v[lang], `${id}.${k}.${lang} con cita`).not.toMatch(/\[[A-Za-z_]{2,}[\]\d]/);
        }
        expect(v.en, `${id}.${k} sin traducir`).not.toBe(v.es);
      }
    }
  });

  it('números razonables y coherentes', () => {
    for (const [id, s] of Object.entries(data)) {
      for (const n of [s.isolationM.min, s.isolationM.rec]) expect(n === null || (n >= 0 && n <= 3000), `${id} aislamiento`).toBe(true);
      if (s.isolationM.min !== null && s.isolationM.rec !== null) expect(s.isolationM.min, `${id} mín > recomendado`).toBeLessThanOrEqual(s.isolationM.rec);
      for (const n of [s.minPlants.min, s.minPlants.rec]) expect(n === null || (n >= 1 && n <= 500), `${id} plantas`).toBe(true);
      if (s.minPlants.min !== null && s.minPlants.rec !== null) expect(s.minPlants.min, `${id} plantas mín > rec`).toBeLessThanOrEqual(s.minPlants.rec);
      const { min, max } = s.yearsViable;
      for (const n of [min, max]) expect(n === null || (n >= 0 && n <= 30), `${id} años`).toBe(true);
      if (min !== null && max !== null) expect(min, `${id} años mín > máx`).toBeLessThanOrEqual(max);
    }
  });

  it('cada ficha trae fuentes con enlace y licencia, y las de baja confianza lo dicen', () => {
    for (const [id, s] of Object.entries(data)) {
      expect(s.sources.length, `${id} sin fuentes`).toBeGreaterThanOrEqual(2);
      for (const f of s.sources) {
        expect(f.name.length, id).toBeGreaterThan(3);
        expect(f.url, id).toMatch(/^https?:\/\//);
        expect(f.license.length, `${id} sin licencia`).toBeGreaterThan(2);
      }
      if (s.confidence === 'low') expect(s.caveat, `${id}: baja confianza sin aviso`).not.toBeNull();
    }
  });

  it('los cultivos que no se multiplican por semilla no llevan aislamiento', () => {
    for (const id of ['ajo', 'batata', 'papa', 'frutilla', 'oca']) {
      const s = data[id]!;
      expect(s.cycle, id).toBe('vegetative');
      expect(s.isolationM, id).toEqual({ min: null, rec: null });
    }
  });
});

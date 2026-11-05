import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEEDS } from './content';
import { creditFor, KNOT_BY_ID, KNOTS, knotImages } from './knots';
import { searchKnots } from './search';

const all = { query: '', use: null, type: null, props: [] };

describe('guía de nudos: datos', () => {
  it('cada nudo relacionado, del asistente y cada imagen existe, y cada imagen tiene su crédito', () => {
    for (const k of KNOTS) {
      for (const r of k.related) expect(KNOT_BY_ID.has(r), `${k.id} → ${r}`).toBe(true);
      expect(k.steps.length, k.id).toBeGreaterThanOrEqual(2);
      const imgs = knotImages(k);
      expect(imgs.length, `${k.id} sin imágenes`).toBeGreaterThan(0);
      for (const f of imgs) {
        expect(existsSync(new URL(`../../../public/knots/${f}`, import.meta.url)), f).toBe(true);
        expect(creditFor(f), `sin crédito: ${f}`).toBeDefined();
      }
    }
    for (const n of NEEDS) for (const o of n.options) for (const id of o.knots) expect(KNOT_BY_ID.has(id), `${n.id} → ${id}`).toBe(true);
    expect(new Set(KNOTS.map((k) => k.id)).size).toBe(KNOTS.length);
  });

  it('crédito correcto: el más específico gana', () => {
    expect(creditFor('as-de-guia-doble-1.webp')?.source).toContain('FM 3-97.61');
    expect(creditFor('as-de-guia-1.webp')?.source).toContain('FM 3-05.70');
    expect(creditFor('machard-1.webp')?.license).toBe('CC BY-SA 3.0');
  });
});

describe('guía de nudos: búsqueda', () => {
  it('por nombre sin acentos y por alias', () => {
    expect(searchKnots({ ...all, query: 'as de guia' }, 'es')[0]!.id).toBe('as-de-guia');
    expect(searchKnots({ ...all, query: 'Marchand' }, 'es').map((k) => k.id)).toContain('machard');
    expect(searchKnots({ ...all, query: 'bowline' }, 'es')[0]!.id).toBe('as-de-guia');
  });

  it('por uso: en Rappel están el Machard y el dinámico; no la atadura cuadrada', () => {
    const ids = searchKnots({ ...all, use: 'rappel' }, 'es').map((k) => k.id);
    expect(ids).toContain('machard');
    expect(ids).toContain('dinamico');
    expect(ids).not.toContain('atadura-cuadrada');
  });

  it('por tipo y propiedades', () => {
    const friction = searchKnots({ ...all, type: 'friction' }, 'es').map((k) => k.id);
    expect(friction.sort()).toEqual(['bachmann', 'klemheist', 'machard', 'prusik']);
    const oneHand = searchKnots({ ...all, props: ['oneHand'] }, 'es').map((k) => k.id);
    expect(oneHand).toContain('as-de-guia');
    expect(oneHand).not.toContain('ocho-doble');
  });

  it('por lo que hace (texto de para qué sirve)', () => {
    expect(searchKnots({ ...all, query: 'tronco' }, 'es').map((k) => k.id)).toContain('lenador');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveNext, TOPIC_BY_ID, TOPICS } from './content';
import { COUNTRIES } from '@/core/settings/settings';
import { fillGuideText, type L } from './types';

const texts = (l: L) => [l.es, l.en];

describe('guía de primeros auxilios', () => {
  it('cada opción lleva a un paso que existe', () => {
    for (const topic of TOPICS) {
      expect(topic.nodes[topic.start], `${topic.id}: inicio`).toBeDefined();
      for (const [id, node] of Object.entries(topic.nodes)) {
        for (const o of node.options ?? []) {
          const { topic: t, node: n } = resolveNext(topic.id, o.next);
          expect(TOPIC_BY_ID.get(t)?.nodes[n], `${topic.id}/${id} → ${o.next}`).toBeDefined();
        }
      }
    }
  });

  it('todos los pasos se pueden alcanzar desde el inicio del tema', () => {
    for (const topic of TOPICS) {
      const seen = new Set([topic.start]);
      const queue = [topic.start];
      while (queue.length) {
        for (const o of topic.nodes[queue.shift()!]!.options ?? []) {
          if (!o.next.startsWith('topic:') && !seen.has(o.next)) {
            seen.add(o.next);
            queue.push(o.next);
          }
        }
      }
      // Los pasos a los que se entra desde otro tema (topic:x#paso) también cuentan.
      for (const other of TOPICS)
        for (const node of Object.values(other.nodes))
          for (const o of node.options ?? []) {
            const r = resolveNext(other.id, o.next);
            if (r.topic === topic.id) seen.add(r.node);
          }
      expect(Object.keys(topic.nodes).filter((n) => !seen.has(n)), topic.id).toEqual([]);
    }
  });

  it('todo está escrito en español y en inglés', () => {
    for (const topic of TOPICS) {
      const all = [topic.title, topic.keywords, ...Object.values(topic.nodes).flatMap((n) => [n.title, ...(n.question ? [n.question] : []), ...n.steps.map((s) => s.text), ...(n.options ?? []).map((o) => o.label)])];
      for (const l of all) for (const text of texts(l)) expect(text.trim(), topic.id).not.toBe('');
    }
  });

  it('en cada país el texto queda completo, con sus números', () => {
    for (const country of COUNTRIES) {
      for (const topic of TOPICS) {
        for (const node of Object.values(topic.nodes)) {
          for (const step of node.steps) {
            for (const lang of ['es', 'en'] as const) {
              const text = fillGuideText(step.text[lang], country, lang);
              expect(text, `${country} ${topic.id}: ${text}`).not.toMatch(/[{}]/);
            }
          }
        }
      }
    }
    expect(fillGuideText('Llamá al {medical}.', 'AR', 'es')).toBe('Llamá al 107 o al 911.');
    expect(fillGuideText('Llamá al {medical}.', 'CL', 'es')).toBe('Llamá al 131 o al 133.');
    expect(fillGuideText('Llamá al {medical}.', 'UY', 'es')).toBe('Llamá al 911.');
    expect(fillGuideText('Llamá al {poison}.', 'UY', 'es')).toBe('Llamá al CIAT (centro toxicológico).');
  });

  it('la evaluación inicial lleva a todas las guías', () => {
    const reached = new Set(Object.values(TOPIC_BY_ID.get('assess')!.nodes).flatMap((n) => (n.options ?? []).map((o) => resolveNext('assess', o.next).topic)));
    expect(TOPICS.filter((t) => t.id !== 'assess' && !reached.has(t.id)).map((t) => t.id)).toEqual([]);
  });
});

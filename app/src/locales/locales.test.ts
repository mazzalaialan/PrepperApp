import { describe, expect, it } from 'vitest';
import { NATIONAL_NUMBERS } from '@/modules/emergency/national';
import { CONTACT_KINDS } from '@/modules/emergency/parts';
import en from './en.json';
import es from './es.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('traducciones', () => {
  it('español e inglés tienen las mismas claves', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  it('cada número de emergencia de cada país tiene nombre y descripción', () => {
    for (const list of Object.values(NATIONAL_NUMBERS)) {
      for (const n of list) {
        for (const lang of [es, en]) {
          const entry = (lang.emergency.national as Record<string, { name?: string; desc?: string }>)[n.id];
          expect(entry?.name, n.id).toBeTruthy();
          expect(entry?.desc, n.id).toBeTruthy();
        }
      }
    }
  });

  it('cada tipo de contacto tiene su nombre', () => {
    for (const kind of CONTACT_KINDS) {
      expect(es.emergency.kind, kind).toHaveProperty(kind);
      expect(en.emergency.kind, kind).toHaveProperty(kind);
    }
  });
});

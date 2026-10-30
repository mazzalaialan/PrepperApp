import { describe, expect, it } from 'vitest';
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
});

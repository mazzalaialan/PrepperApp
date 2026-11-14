import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { volcanoReadStamp, VOLCANO_EVERY_MS } from '../src/volcanoes/watch.ts';

describe('lectura de volcanes', () => {
  const now = 1_000_000_000;
  it('si todo anda bien espera la media hora completa', () => {
    assert.equal(now + 10 * 60_000 - volcanoReadStamp(true, now) > VOLCANO_EVERY_MS, false);
  });
  it('si falló una fuente, la vuelta siguiente (10 min) ya reintenta', () => {
    const stamp = volcanoReadStamp(false, now);
    assert.equal(now + 10 * 60_000 - stamp > VOLCANO_EVERY_MS, true);
    assert.equal(now + 60_000 - stamp > VOLCANO_EVERY_MS, false);
  });
});

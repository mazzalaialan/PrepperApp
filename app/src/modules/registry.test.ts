import { describe, expect, it } from 'vitest';
import { CAPABILITIES, type CapabilityMap } from '@/core/capabilities/capabilities';
import { moduleStatus, type ModuleDef } from './registry';

const allCaps = (value: boolean) => Object.fromEntries(CAPABILITIES.map((c) => [c, value])) as CapabilityMap;

const mod = (over: Partial<ModuleDef>): ModuleDef =>
  ({ id: 'x', section: 'field', icon: () => null, phase: 'F3', implemented: true, ...over }) as ModuleDef;

describe('moduleStatus', () => {
  it('disponible con todas las capacidades', () => {
    expect(moduleStatus(mod({ requires: ['orientation'] }), allCaps(true))).toEqual({ kind: 'available' });
  });

  it('no disponible sin capacidad requerida, aunque no esté implementado', () => {
    expect(moduleStatus(mod({ requires: ['orientation'], implemented: false }), allCaps(false))).toEqual({
      kind: 'unavailable',
      missing: ['orientation'],
    });
  });

  it('próximamente si no está implementado', () => {
    expect(moduleStatus(mod({ implemented: false, phase: 'F5' }), allCaps(true))).toEqual({ kind: 'soon', phase: 'F5' });
  });

  it('degradado sin capacidad opcional', () => {
    expect(moduleStatus(mod({ degradesWithout: ['geolocation'] }), allCaps(false))).toEqual({
      kind: 'degraded',
      missing: ['geolocation'],
    });
  });
});

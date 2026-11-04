import { describe, expect, it } from 'vitest';
import { alertsNotification, lightningNotification, rainNotification } from './format';

describe('texto de notificaciones', () => {
  it('lista lo más urgente primero y resume el resto', () => {
    const { title, body } = alertsNotification(
      [
        { itemName: 'Agua', kind: 'expiry', dueDate: '2026-12-15' },
        { itemName: 'Atún', kind: 'expiry', dueDate: '2026-10-01' },
        { itemName: 'Filtro', kind: 'capacity', dueDate: null },
        { itemName: 'Pilas', kind: 'expiry', dueDate: '2026-11-02' },
        { itemName: 'Arroz', kind: 'expiry', dueDate: '2027-01-10' },
      ],
      'es',
      '2026-11-02',
    );
    expect(title).toBe('5 alertas pendientes');
    expect(body.split('\n')).toEqual(['Filtro: por agotarse', 'Atún: vencido', 'Pilas: vence hoy', 'y 2 más']);
  });

  it('faltantes de recomendaciones', () => {
    const { body } = alertsNotification([{ itemName: 'Agua para tomar y cocinar', kind: 'shortage', dueDate: null }], 'es', '2026-11-02');
    expect(body).toBe('Agua para tomar y cocinar: falta stock según tus recomendaciones');
  });

  it('debajo del stock mínimo', () => {
    const { body } = alertsNotification([{ itemName: 'Torniquete CAT', kind: 'minStock', dueDate: null }], 'es', '2026-11-02');
    expect(body).toBe('Torniquete CAT: debajo del stock mínimo');
  });

  it('en inglés', () => {
    const { title, body } = alertsNotification([{ itemName: 'Water', kind: 'expiry', dueDate: '2026-12-15' }], 'en', '2026-11-02');
    expect(title).toBe('1 pending alert');
    expect(body).toBe('Water: expires Dec 15');
  });

  it('aviso de lluvia: lugar, "donde estás" y antigüedad de la ubicación', () => {
    const now = Date.parse('2026-11-03T15:00:00Z');
    const rain = { placeId: 'w1', label: 'Refugio', state: 'soon' as const, inMinutes: 45, mm: 3.5, fixAt: null };
    expect(rainNotification(rain, 'es', now)).toEqual({ title: 'Lluvia en unos 45 min · Refugio', body: 'Se esperan 3,5 mm en las próximas 2 horas.\nAviso informativo, no oficial: las alertas oficiales son del SMN.' });
    const here = { ...rain, placeId: 'here', label: null, state: 'raining' as const, fixAt: '2026-11-03T12:00:00Z' };
    expect(rainNotification(here, 'es', now)).toEqual({
      title: 'Está lloviendo · Donde estás',
      body: 'Se esperan 3,5 mm en las próximas 2 horas.\nSegún tu última ubicación conocida (hace 3 horas).\nAviso informativo, no oficial: las alertas oficiales son del SMN.',
    });
    // Ubicación reciente: no se aclara.
    expect(rainNotification({ ...here, fixAt: '2026-11-03T14:50:00Z' }, 'en', now).body).toBe('3.5 mm expected in the next 2 hours.\nInformational, not official: official alerts come from the SMN.');
  });

  it('aviso de rayos: distancia, dirección y qué hacer', () => {
    const now = Date.parse('2026-11-04T18:00:00Z');
    const l = { placeId: 'w1', label: 'Casa', distanceKm: 12, bearing: 315, fixAt: null };
    const es = lightningNotification(l, 'es', now);
    expect(es.title).toBe('Rayos a 12 km al noroeste · Casa');
    expect(es.body).toMatch(/^Buscá refugio/);
    expect(es.body).toMatch(/las alertas oficiales son del SMN\.$/);
    expect(lightningNotification({ ...l, label: null, bearing: 359, distanceKm: 0 }, 'en', now).title).toBe('Lightning 1 km north · Where you are');
    expect(lightningNotification({ ...l, fixAt: '2026-11-04T15:00:00Z' }, 'es', now).body).toMatch(/hace 3 horas/);
  });

  it('aviso de lluvia vista por el satélite', () => {
    const rain = { placeId: 'w1', label: 'Casa', state: 'raining' as const, inMinutes: 0, mm: 6, fixAt: null, observedMmH: 6.2 };
    expect(rainNotification(rain, 'es').body).toBe('El satélite ve lluvia de unos 6,2 mm/h ahora (estimación por infrarrojo, orientativa).\nAviso informativo, no oficial: las alertas oficiales son del SMN.');
  });
});

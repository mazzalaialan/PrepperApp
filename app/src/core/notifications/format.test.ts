import { describe, expect, it } from 'vitest';
import { alertsNotification } from './format';

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
});

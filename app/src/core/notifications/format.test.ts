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
    expect(title).toBe('5 alertas en tu inventario');
    expect(body.split('\n')).toEqual(['Filtro: por agotarse', 'Atún: vencido', 'Pilas: vence hoy', 'y 2 más']);
  });

  it('en inglés', () => {
    const { title, body } = alertsNotification([{ itemName: 'Water', kind: 'expiry', dueDate: '2026-12-15' }], 'en', '2026-11-02');
    expect(title).toBe('1 alert in your inventory');
    expect(body).toBe('Water: expires Dec 15');
  });
});

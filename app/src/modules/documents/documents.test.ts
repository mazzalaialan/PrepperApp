import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { PersonalDocument } from '@/core/model/types';
import { parseTags } from './DocumentEditPage';
import { documentAlertRows, expiringDocuments } from './expiry';

const doc = (title: string, expiryDate?: string | null) => newEntity<PersonalDocument>({ title, notes: '', tags: [], expiryDate });

describe('vencimiento de documentos', () => {
  const dni = doc('DNI', '2026-12-30');
  const passport = doc('Pasaporte', '2027-06-01');
  const license = doc('Licencia', '2026-10-01');
  const old = doc('Escritura'); // guardado antes de que existiera el campo

  it('entra en aviso 60 días antes, y los vencidos primero', () => {
    const rows = expiringDocuments([dni, passport, license, old], '2026-10-31');
    expect(rows.map((r) => [r.document.title, r.daysLeft])).toEqual([
      ['Licencia', -30],
      ['DNI', 60],
    ]);
    expect(expiringDocuments([dni], '2026-10-30')).toEqual([]);
  });

  it('el índice de notificaciones avisa desde 60 días antes', () => {
    expect(documentAlertRows([dni, old])).toEqual([
      { lotId: `doc:${dni.id}`, itemName: 'DNI', kind: 'expiry', dueDate: '2026-12-30', notifyFrom: '2026-10-31' },
    ]);
  });
});

describe('parseTags', () => {
  it('separa por comas, recorta y descarta vacías y repetidas', () => {
    expect(parseTags(' dni, Familia , ,viaje,dni')).toEqual(['dni', 'Familia', 'viaje']);
  });

  it('texto vacío → sin etiquetas', () => {
    expect(parseTags('  ')).toEqual([]);
  });
});

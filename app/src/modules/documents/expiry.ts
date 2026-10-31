import type { AlertIndexRow } from '@/core/db/db';
import type { IsoDay, PersonalDocument } from '@/core/model/types';
import { addDays, daysBetween } from '@/modules/inventory/domain/dates';

/**
 * Los documentos avisan con 60 días: renovarlos suele pedir turno y trámites,
 * y los turnos (DNI, pasaporte, licencia) se dan con semanas de demora.
 */
export const DOCUMENT_LEAD_DAYS = 60;

export interface DocumentExpiry {
  document: PersonalDocument;
  dueDate: IsoDay;
  /** Negativo si ya venció. */
  daysLeft: number;
}

/** Documentos que ya entraron en la ventana de aviso (o vencieron), lo más urgente primero. */
export function expiringDocuments(documents: Iterable<PersonalDocument>, today: IsoDay): DocumentExpiry[] {
  const rows: DocumentExpiry[] = [];
  for (const document of documents) {
    const dueDate = document.expiryDate;
    if (!dueDate || document.deletedAt || today < addDays(dueDate, -DOCUMENT_LEAD_DAYS)) continue;
    rows.push({ document, dueDate, daysLeft: daysBetween(today, dueDate) });
  }
  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Filas del índice de notificaciones: todas las fechas cargadas, también las que todavía no entran en ventana. */
export function documentAlertRows(documents: Iterable<PersonalDocument>): AlertIndexRow[] {
  const rows: AlertIndexRow[] = [];
  for (const d of documents) {
    if (!d.expiryDate || d.deletedAt) continue;
    rows.push({
      lotId: `doc:${d.id}`,
      itemName: d.title.slice(0, 200),
      kind: 'expiry',
      dueDate: d.expiryDate,
      notifyFrom: addDays(d.expiryDate, -DOCUMENT_LEAD_DAYS),
    });
  }
  return rows;
}

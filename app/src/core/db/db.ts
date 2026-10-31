import Dexie, { type Table } from 'dexie';
import type { Sealed } from '@/core/crypto/crypto';
import type { EntityTable, IsoDay } from '@/core/model/types';

/** Fila cifrada: solo los metadatos de sincronización quedan en claro. */
export interface EncryptedRow extends Sealed {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface KeyValueRow<T = unknown> {
  key: string;
  value: T;
}

/** Índice mínimo de alertas, en claro a propósito (ver ARQUITECTURA §5.3). */
export interface AlertIndexRow {
  /** Id del lote, `rec:<id de regla>` (faltante de recomendaciones) o `min:<id de mínimo>` (debajo del stock mínimo). */
  lotId: string;
  itemName: string;
  kind: 'expiry' | 'capacity' | 'shortage' | 'minStock';
  /** Solo vencimientos. */
  dueDate: IsoDay | null;
  /** Desde qué día corresponde notificar. */
  notifyFrom: IsoDay;
}

/** Tablas de la versión 1 del esquema: no se modifica (las nuevas van en su propia versión). */
const V1_ENTITY_TABLES = [
  'categories',
  'locations',
  'items',
  'lots',
  'stockMins',
  'documents',
  'attachments',
  'waypoints',
  'householdMembers',
  'recommendationRules',
] as const satisfies readonly EntityTable[];

export const ENTITY_TABLES = [...V1_ENTITY_TABLES, 'medicalProfiles', 'routes'] as const satisfies readonly EntityTable[];

/** Binarios cifrados (fotos), separados para no cargarlos a memoria al desbloquear. */
export interface BlobRow extends Sealed {
  id: string;
}

export class UserDb extends Dexie {
  meta!: Table<KeyValueRow, string>;
  blobs!: Table<BlobRow, string>;
  settings!: Table<KeyValueRow, string>;
  alertIndex!: Table<AlertIndexRow, string>;
  categories!: Table<EncryptedRow, string>;
  locations!: Table<EncryptedRow, string>;
  items!: Table<EncryptedRow, string>;
  lots!: Table<EncryptedRow, string>;
  stockMins!: Table<EncryptedRow, string>;
  documents!: Table<EncryptedRow, string>;
  attachments!: Table<EncryptedRow, string>;
  waypoints!: Table<EncryptedRow, string>;
  householdMembers!: Table<EncryptedRow, string>;
  recommendationRules!: Table<EncryptedRow, string>;
  medicalProfiles!: Table<EncryptedRow, string>;
  routes!: Table<EncryptedRow, string>;

  constructor(name = 'vikarg-user') {
    super(name);
    // Cada cambio de esquema es una versión nueva con su migración; nunca se edita una versión publicada.
    const encrypted = Object.fromEntries(V1_ENTITY_TABLES.map((t) => [t, 'id, updatedAt']));
    this.version(1).stores({
      meta: 'key',
      settings: 'key',
      blobs: 'id',
      alertIndex: 'lotId, dueDate',
      ...encrypted,
    });
    // v2: el índice de alertas se consulta por fecha de aviso. Se regenera completo al desbloquear.
    this.version(2)
      .stores({ alertIndex: 'lotId, notifyFrom' })
      .upgrade((tx) => tx.table('alertIndex').clear());
    // v3: fichas médicas y rutas de waypoints.
    this.version(3).stores({ medicalProfiles: 'id, updatedAt', routes: 'id, updatedAt' });
  }

  entityTable(name: EntityTable): Table<EncryptedRow, string> {
    return this.table(name);
  }
}

export let db = new UserDb();

/** Solo para tests: reemplaza la base por una aislada. */
export function setTestDb(name: string): UserDb {
  db = new UserDb(name);
  return db;
}

/**
 * Modelo de datos del usuario (ver docs/ARQUITECTURA.md §5).
 * Todas las entidades se guardan cifradas; solo `id`, `updatedAt` y
 * `deletedAt` quedan en claro para sincronización y purga.
 */

export type Id = string; // UUID v7
export type IsoDate = string; // ISO 8601 (fecha-hora)
export type IsoDay = string; // YYYY-MM-DD

export interface BaseEntity {
  id: Id;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  deletedAt: IsoDate | null;
}

export type ControlType = 'none' | 'expiryDate' | 'shelfLife' | 'capacity';

/** Configuración de alertas; en el artículo, `null` significa "hereda de la categoría". */
export interface AlertConfig {
  controlType: ControlType;
  alertsEnabled: boolean;
  alertLeadDays: number;
  alertCapacityPct: number;
}

export interface Category extends BaseEntity, AlertConfig {
  /** Clave de traducción para categorías del sistema; `null` en las del usuario. */
  nameKey: string | null;
  name: string;
  isSystem: boolean;
  hidden: boolean;
  icon: string;
  color: string;
  order: number;
}

export const MAX_LOCATION_DEPTH = 4;

export interface Location extends BaseEntity {
  parentId: Id | null;
  depth: number; // 1..MAX_LOCATION_DEPTH
  name: string;
  notes: string;
  waypointId: Id | null;
}

export interface Item extends BaseEntity {
  name: string;
  categoryId: Id;
  notes: string;
  barcode: string | null;
  /** Texto libre, sin conversiones (ej.: "latas", "L"). */
  unit: string;
  /** Peso por unidad, siempre en gramos. */
  weightGrams: number | null;
  favorite: boolean;
  controlType: ControlType | null;
  alertsEnabled: boolean | null;
  alertLeadDays: number | null;
  alertCapacityPct: number | null;
}

export interface Lot extends BaseEntity {
  itemId: Id;
  locationId: Id;
  /** Total en la unidad del artículo. Si se carga por envases, = packageCount × packageSize. */
  quantity: number;
  /** Carga por envases (ej.: 4 botellas de 6 L). Todos `null` = cantidad directa. */
  packageCount: number | null;
  packageSize: number | null;
  packageName: string | null;
  /** Peso de cada envase vacío; solo se suma al peso si se cargó. */
  packageTareGrams: number | null;
  expiryDate: IsoDay | null;
  manufactureDate: IsoDay | null;
  shelfLifeMonths: number | null;
  capacityTotal: number | null;
  capacityRemaining: number | null;
  capacityUnit: string | null;
  notes: string;
}

export interface StockMin extends BaseEntity {
  itemId: Id;
  locationId: Id;
  minQuantity: number;
}

export interface PersonalDocument extends BaseEntity {
  title: string;
  notes: string;
  tags: string[];
}

export type AttachmentOwner = 'item' | 'document' | 'location' | 'waypoint';

export interface Attachment extends BaseEntity {
  ownerType: AttachmentOwner;
  ownerId: Id;
  mime: string;
  width: number;
  height: number;
  order: number;
  /** Los bytes viven cifrados en la tabla `blobs` bajo este mismo id; se leen bajo demanda. */
  sizeBytes: number;
}

export interface Waypoint extends BaseEntity {
  name: string;
  lat: number;
  lon: number;
  alt: number | null;
  icon: string;
  notes: string;
}

export interface HouseholdMember extends BaseEntity {
  label: string;
  count: number;
}

export interface RecommendationRule extends BaseEntity {
  description: string;
  categoryId: Id | null;
  itemId: Id | null;
  quantityPerMemberPerDay: number;
  unit: string;
  targetDays: number;
  /** Miembros a los que aplica; vacío = todos. */
  memberIds: Id[];
}

/** Mapa de tabla → tipo de entidad. Agregar una entidad = agregarla acá y en db.ts. */
export interface EntityMap {
  categories: Category;
  locations: Location;
  items: Item;
  lots: Lot;
  stockMins: StockMin;
  documents: PersonalDocument;
  attachments: Attachment;
  waypoints: Waypoint;
  householdMembers: HouseholdMember;
  recommendationRules: RecommendationRule;
}

export type EntityTable = keyof EntityMap;

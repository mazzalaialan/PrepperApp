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

/** Botiquines específicos por problema; "other" para los que arme el usuario. */
export const KIT_TYPES = ['general', 'trauma', 'bleeding', 'anaphylaxis', 'burns', 'other'] as const;
export type KitType = (typeof KIT_TYPES)[number];

export interface Location extends BaseEntity {
  parentId: Id | null;
  depth: number; // 1..MAX_LOCATION_DEPTH
  name: string;
  notes: string;
  waypointId: Id | null;
  /** Si no es `null`, la ubicación es un botiquín (una caja o mochila) de ese tipo. */
  kitType: KitType | null;
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
  /** Vencimiento del documento (DNI, pasaporte, licencia…). Ausente en los guardados antes de 0.7.4. */
  expiryDate?: IsoDay | null;
  /** Médicos (estudios, recetas, carnet de vacunas…) o generales. Ausente = general. */
  category?: DocumentCategory;
  /** De quién es: una ficha médica (persona o mascota); ausente o null = general. */
  profileId?: Id | null;
  /** Posición elegida por el usuario dentro de su grupo; sin ordenar, van al final por título. */
  order?: number;
}

export type DocumentCategory = 'general' | 'medical';

export type AttachmentOwner = 'item' | 'document' | 'location' | 'waypoint' | 'medicalProfile';

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
  /** Avisar si va a llover en este punto. */
  rainAlerts: boolean;
}

/** Lista ordenada de waypoints con nombre (ej.: "Evacuación al refugio"). */
export interface Route extends BaseEntity {
  name: string;
  /** En orden de recorrido; un punto puede repetirse (ida y vuelta). */
  waypointIds: Id[];
  notes: string;
}

/** `radio`: frecuencia guardada por el usuario (p. ej. la que le dieron en un refugio). */
export type ContactKind = 'police' | 'fire' | 'medical' | 'hospital' | 'civilDefense' | 'other' | 'radio';

/** Contacto de emergencia: comisaría, bomberos, hospital, médico, familiar… */
export interface EmergencyContact extends BaseEntity {
  kind: ContactKind;
  name: string;
  phone: string;
  phone2: string;
  address: string;
  /** Ubicación, si se conoce (para ordenar por cercanía y abrir el mapa exacto). */
  lat: number | null;
  lon: number | null;
  notes: string;
  /** De dónde salió (búsqueda de cercanos): para saber qué tan confiable es. */
  source: string | null;
  /** Solo frecuencias de radio (ausentes en los contactos guardados antes de 0.10). */
  frequency?: string;
  /** Tono (CTCSS/DCS), canal u otro dato para sintonizar. */
  tone?: string;
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

export interface Medication {
  name: string;
  dose: string;
  /** Indicaciones en texto libre ("en ayunas", "con comida"); antes de 0.11 era el único dato de cuándo tomarlo. */
  schedule: string;
  /** Cada cuántas horas (24 = una vez por día, 168 = semanal); 0 = solo si hace falta; null = sin indicar. */
  everyHours?: number | null;
  /** Hora de la primera toma del día ("08:00"); las demás se calculan. */
  firstTime?: string | null;
}

export type ProfileKind = 'person' | 'pet';
export type PetSpecies = 'dog' | 'cat' | 'other';

/** Ficha médica de una persona o una mascota del grupo familiar. */
/** Un profesional de la salud de la persona: de cabecera, psicólogo, psiquiatra… */
export interface Doctor {
  /** Especialidad o rol ("Médico de cabecera", "Psiquiatra"). */
  role: string;
  name: string;
  phone: string;
}

/** Obra social o prepaga. */
export interface HealthInsurance {
  name: string;
  plan: string;
  /** Número de credencial / afiliado. */
  memberNumber: string;
  /** Teléfono de emergencias (urgencias, ambulancia) de la obra social. */
  emergencyPhone: string;
}

/** Un contacto de emergencia: otra ficha médica (sus datos se leen de ahí) o un texto libre ("María 11 5555-1234"). */
export interface EmergencyContactRef {
  profileId: Id | null;
  text: string;
}

export interface MedicalProfile extends BaseEntity {
  kind: ProfileKind;
  name: string;
  /** Solo personas: "Hijo", "Madre", "Pareja"… (ausente en las fichas anteriores a 0.11). */
  relationship?: string;
  /** Solo personas: para llamarla desde Contactos de emergencia. */
  phone?: string;
  /** Solo personas: si aparece en Contactos de emergencia (por defecto, sí). */
  inContacts?: boolean;
  /** La ficha del usuario (parentesco "Yo"): sus datos van arriba de todo en Contactos. Solo una. */
  isMe?: boolean;
  /**
   * Contactos de emergencia, en orden de prioridad (desde 0.11.1). `emergencyContact`
   * queda como texto de respaldo para versiones anteriores.
   */
  emergencyContacts?: EmergencyContactRef[];
  /** Solo personas (desde 0.11.1): antes iban en el texto de `doctor`, que queda como respaldo. */
  doctors?: Doctor[];
  insurance?: HealthInsurance;
  birthDate: IsoDay | null;
  /** "A+", "0-", etc.; vacío si no se sabe. */
  bloodType: string;
  allergies: string;
  conditions: string;
  medications: Medication[];
  emergencyContact: string;
  /** Médico y obra social; en mascotas, veterinario. */
  doctor: string;
  notes: string;
  /** Solo mascotas (en personas quedan en `null`). */
  pet: PetHealth | null;
}

export interface PetHealth {
  species: PetSpecies;
  /** Especie escrita si es "other" (ej.: conejo). */
  speciesOther: string;
  lastRabiesVaccine: IsoDay | null;
  /** Séxtuple/polivalente en perros, triple felina en gatos. */
  lastSpeciesVaccine: IsoDay | null;
  lastDeworming: IsoDay | null;
  /** `null` = no se sabe. */
  neutered: boolean | null;
  lastFleaTreatment: IsoDay | null;
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
  medicalProfiles: MedicalProfile;
  routes: Route;
  contacts: EmergencyContact;
}

export type EntityTable = keyof EntityMap;

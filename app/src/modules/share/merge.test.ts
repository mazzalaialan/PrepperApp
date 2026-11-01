import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Attachment, EmergencyContact, Item, Location, Lot, MedicalProfile, PersonalDocument, Route, Waypoint } from '@/core/model/types';
import { emptyInsurance, normalizeProfile } from '@/modules/firstAid/medicalStore';
import { mergeShare, type LocalData, type MergeDecisions } from './merge';
import { decodeShare, encodeShare, ShareError, type SharePayload } from './package';

const profile = (fields: Partial<MedicalProfile>): MedicalProfile =>
  normalizeProfile({
    ...newEntity<MedicalProfile>({
      kind: 'person',
      name: '',
      birthDate: null,
      bloodType: '',
      allergies: '',
      conditions: '',
      medications: [],
      emergencyContact: '',
      doctor: '',
      notes: '',
      pet: null,
      insurance: emptyInsurance(),
    }),
    ...fields,
  });

const contact = (fields: Partial<EmergencyContact>): EmergencyContact => ({
  ...newEntity<EmergencyContact>({ kind: 'other', name: '', phone: '', phone2: '', address: '', lat: null, lon: null, notes: '', source: null }),
  ...fields,
});

const payload = (fields: Partial<SharePayload>): SharePayload => ({
  createdAt: '2026-11-01T00:00:00Z',
  from: 'Ana',
  profiles: [],
  contacts: [],
  documents: [],
  attachments: [],
  blobs: {},
  ...fields,
});

const empty: LocalData = {
  profiles: [],
  contacts: [],
  documents: [],
  attachments: [],
  inventory: { categories: [], locations: [], items: [], lots: [], stockMins: [] },
  waypoints: [],
  routes: [],
};
const none = (): MergeDecisions => ({ separate: new Set(), useTheirs: new Set() });

describe('compartir con un familiar: mezcla', () => {
  it('lo nuevo se agrega sin lo que depende de quién mira (parentesco, Yo)', () => {
    const ana = profile({ name: 'Ana', relationship: 'Yo', isMe: true, inContacts: false, phone: '11 1111-1111' });
    const r = mergeShare(empty, payload({ profiles: [ana] }), none());
    expect(r.newProfiles).toHaveLength(1);
    expect(r.newProfiles[0]).toMatchObject({ name: 'Ana', relationship: '', isMe: false, inContacts: true, phone: '11 1111-1111' });
  });

  it('nunca borra: lo que ya hay queda, y se completan los datos vacíos', () => {
    const mine = profile({ name: 'Tomi', birthDate: '2017-03-02', relationship: 'Hermano', allergies: 'Penicilina', medications: [{ name: 'Ibuprofeno', dose: '', schedule: '' }] });
    const theirs = profile({
      name: 'tomi',
      birthDate: '2017-03-02',
      relationship: 'Hijo',
      bloodType: 'A+',
      medications: [{ name: 'Ibuprofeno', dose: '200 mg', schedule: '' }, { name: 'Salbutamol', dose: '', schedule: '' }],
    });
    const r = mergeShare({ ...empty, profiles: [mine] }, payload({ profiles: [theirs] }), none());
    expect(r.newProfiles).toHaveLength(0);
    expect(r.matches[0]).toMatchObject({ sameRecord: false, conflicts: [] });
    const saved = r.writes.profiles[0]!;
    expect(saved.id).toBe(mine.id);
    expect(saved.relationship).toBe('Hermano');
    expect(saved.allergies).toBe('Penicilina');
    expect(saved.bloodType).toBe('A+');
    expect(saved.medications.map((m) => m.name)).toEqual(['Ibuprofeno', 'Salbutamol']);
  });

  it('datos distintos: se pregunta; por defecto queda el propio y se puede elegir el que llega', () => {
    const mine = profile({ name: 'Tomi', bloodType: '0+' });
    const theirs = profile({ name: 'Tomi', bloodType: 'A+' });
    const local = { ...empty, profiles: [mine] };
    const r = mergeShare(local, payload({ profiles: [theirs] }), none());
    expect(r.matches[0]!.conflicts).toEqual([{ key: `${theirs.id}:bloodType`, field: 'bloodType', mine: '0+', theirs: 'A+' }]);
    expect(r.writes.profiles).toHaveLength(0);
    const chosen = mergeShare(local, payload({ profiles: [theirs] }), { separate: new Set(), useTheirs: new Set([`${theirs.id}:bloodType`]) });
    expect(chosen.writes.profiles[0]!.bloodType).toBe('A+');
  });

  it('si no es la misma persona, se separa y llega como ficha nueva', () => {
    const mine = profile({ name: 'Juan' });
    const theirs = profile({ name: 'Juan', birthDate: '1990-01-01' });
    expect(mergeShare({ ...empty, profiles: [mine] }, payload({ profiles: [theirs] }), none()).matches).toHaveLength(1);
    const r = mergeShare({ ...empty, profiles: [mine] }, payload({ profiles: [theirs] }), { separate: new Set([theirs.id]), useTheirs: new Set() });
    expect(r.matches).toHaveLength(0);
    expect(r.newProfiles).toHaveLength(1);
    // Fechas de nacimiento distintas: no es la misma persona.
    const other = profile({ name: 'Juan', birthDate: '1960-05-05' });
    expect(mergeShare({ ...empty, profiles: [profile({ name: 'Juan', birthDate: '1990-01-01' })] }, payload({ profiles: [other] }), none()).newProfiles).toHaveLength(1);
  });

  it('médicos compartidos: el mismo teléfono es el mismo contacto y las fichas apuntan al que ya hay', () => {
    const myDoc = contact({ kind: 'doctor', name: 'Dra. Gómez', phone: '4777-8888', specialty: '' });
    const theirDoc = contact({ kind: 'doctor', name: 'Gómez', phone: '(4777) 8888', specialty: 'Pediatra', address: 'Av. Siempre Viva 123' });
    const theirTomi = profile({ name: 'Tomi', doctors: [{ contactId: theirDoc.id, role: 'Pediatra', name: 'Gómez', phone: '4777 8888' }] });
    const r = mergeShare({ ...empty, contacts: [myDoc] }, payload({ profiles: [theirTomi], contacts: [theirDoc] }), none());
    expect(r.newContacts).toBe(0);
    expect(r.updatedContacts).toBe(1);
    // Se completó lo que faltaba, sin cambiar el nombre propio.
    expect(r.writes.contacts[0]).toMatchObject({ id: myDoc.id, name: 'Dra. Gómez', specialty: 'Pediatra', address: 'Av. Siempre Viva 123' });
    expect(r.newProfiles[0]!.doctors![0]!.contactId).toBe(myDoc.id);
  });

  it('contactos de emergencia de otra ficha se reubican; los repetidos no se duplican', () => {
    const juan = profile({ name: 'Juan', phone: '11 5555-1234' });
    const theirJuan = profile({ name: 'Juan', phone: '11 5555-1234' });
    const theirTomi = profile({
      name: 'Tomi',
      emergencyContacts: [
        { profileId: theirJuan.id, text: '' },
        { profileId: null, text: 'Escuela 4222-3333' },
      ],
    });
    const myTomi = profile({ name: 'Tomi', emergencyContacts: [{ profileId: null, text: 'Escuela N.º 5 (4222 3333)' }] });
    const r = mergeShare({ ...empty, profiles: [juan, myTomi] }, payload({ profiles: [theirJuan, theirTomi] }), none());
    const tomi = r.writes.profiles.find((p) => p.id === myTomi.id)!;
    expect(tomi.emergencyContacts).toEqual([
      { profileId: null, text: 'Escuela N.º 5 (4222 3333)' },
      { profileId: juan.id, text: '' },
    ]);
  });

  it('mascotas: las fechas de vacunas quedan en la más reciente', () => {
    const pet = (date: string) =>
      profile({
        kind: 'pet',
        name: 'Firulais',
        pet: { species: 'dog', speciesOther: '', lastRabiesVaccine: date, lastSpeciesVaccine: null, lastDeworming: null, neutered: null, lastFleaTreatment: null },
      });
    const mine = pet('2026-03-01');
    const r = mergeShare({ ...empty, profiles: [mine] }, payload({ profiles: [pet('2026-09-10')] }), none());
    expect(r.matches[0]!.conflicts).toEqual([]);
    expect(r.writes.profiles[0]!.pet!.lastRabiesVaccine).toBe('2026-09-10');
    const older = mergeShare({ ...empty, profiles: [mine] }, payload({ profiles: [pet('2025-01-01')] }), none());
    expect(older.writes.profiles).toHaveLength(0);
  });

  it('documentos: se agregan los que faltan, con sus fotos y su dueño reubicado', () => {
    const mine = profile({ name: 'Tomi' });
    const theirs = profile({ name: 'Tomi' });
    const doc = { ...newEntity<PersonalDocument>({ title: 'Carnet de vacunas', notes: '', tags: [], category: 'medical', profileId: theirs.id }), order: 3 };
    const page = newEntity<Attachment>({ ownerType: 'document', ownerId: doc.id, mime: 'image/webp', width: 10, height: 10, order: 0, sizeBytes: 4 });
    const known = newEntity<PersonalDocument>({ title: 'Ya lo tengo', notes: '', tags: [] });
    const r = mergeShare(
      { ...empty, profiles: [mine], documents: [known] },
      payload({ profiles: [theirs], documents: [doc, known], attachments: [page], blobs: { [page.id]: 'AAAA' } }),
      none(),
    );
    expect(r.newDocuments).toBe(1);
    expect(r.existingDocuments).toBe(1);
    expect(r.writes.documents[0]).toMatchObject({ title: 'Carnet de vacunas', profileId: mine.id });
    expect(r.writes.documents[0]!.order).toBeUndefined();
    expect(r.writes.attachments[0]).toMatchObject({ from: page.id, attachment: { ownerId: r.writes.documents[0]!.id } });
  });
});

describe('compartir con un familiar: archivo', () => {
  it('se abre solo con la contraseña del envío', async () => {
    const data = payload({ profiles: [profile({ name: 'Ana' })] });
    const bytes = await encodeShare(data, 'clave-del-envio', 1000);
    expect((await decodeShare(bytes, 'clave-del-envio')).profiles[0]!.name).toBe('Ana');
    await expect(decodeShare(bytes, 'otra')).rejects.toEqual(new ShareError('wrong-password'));
    await expect(decodeShare(new TextEncoder().encode('{"hola":1}'), 'x')).rejects.toEqual(new ShareError('invalid-file'));
  });
});

describe('compartir con un familiar: inventario, waypoints y rutas', () => {
  const waypoint = (name: string, lat: number, lon: number): Waypoint => ({
    ...newEntity<Waypoint>({ name, lat, lon, alt: null, icon: 'pin', notes: '', rainAlerts: false }),
  });
  const location = (name: string, parentId: string | null = null, depth = 1): Location =>
    newEntity<Location>({ name, parentId, depth, notes: '', waypointId: null, kitType: null });
  const item = (name: string, categoryId: string): Item =>
    newEntity<Item>({
      name,
      categoryId,
      notes: '',
      barcode: null,
      unit: '',
      weightGrams: null,
      favorite: false,
      controlType: null,
      alertsEnabled: null,
      alertLeadDays: null,
      alertCapacityPct: null,
    });
  const lot = (itemId: string, locationId: string, quantity: number): Lot =>
    newEntity<Lot>({
      itemId,
      locationId,
      quantity,
      packageCount: null,
      packageSize: null,
      packageName: null,
      packageTareGrams: null,
      expiryDate: '2027-01-01',
      manufactureDate: null,
      shelfLifeMonths: null,
      capacityTotal: null,
      capacityRemaining: null,
      capacityUnit: null,
      notes: '',
    });
  const inventory = (fields: Partial<LocalData['inventory']>) => ({ categories: [], locations: [], items: [], lots: [], stockMins: [], ...fields });

  it('waypoints: el mismo punto (nombre y a menos de 30 m) no se duplica; las rutas apuntan a los propios', () => {
    const mine = waypoint('Refugio', -41.1, -71.3);
    const theirs = waypoint('refugio', -41.10005, -71.30005);
    const lake = waypoint('Lago', -41.2, -71.4);
    const route = newEntity<Route>({ name: 'Al lago', waypointIds: [theirs.id, lake.id], notes: '' });
    const r = mergeShare({ ...empty, waypoints: [mine] }, payload({ waypoints: [theirs, lake], routes: [route] }), none());
    expect(r.waypoints).toEqual({ waypoints: 1, routes: 1 });
    expect(r.writes.waypoints.map((w) => w.name)).toEqual(['Lago']);
    expect(r.writes.routes[0]!.waypointIds).toEqual([mine.id, lake.id]);
  });

  it('inventario: ubicaciones y artículos con el mismo nombre se reusan; los lotes se suman una sola vez', () => {
    const food = 'system-category-food';
    const myPantry = location('Despensa');
    const myRice = item('Arroz', food);
    const theirPantry = location('despensa');
    const theirShelf = location('Estante alto', theirPantry.id, 2);
    const theirRice = { ...item('Arroz', food), barcode: '7790000000001' };
    const theirBeans = item('Lentejas', food);
    const local = { ...empty, inventory: inventory({ categories: [{ id: food } as never], locations: [myPantry], items: [myRice] }) };
    const incoming = payload({
      inventory: inventory({
        categories: [{ id: food, isSystem: true } as never],
        locations: [theirShelf, theirPantry],
        items: [theirRice, theirBeans],
        lots: [lot(theirRice.id, theirPantry.id, 5), lot(theirBeans.id, theirShelf.id, 2)],
      }),
    });
    const r = mergeShare(local, incoming, none());
    expect(r.inventory).toEqual({ items: 1, lots: 2, locations: 1, categories: 0 });
    // El estante queda dentro de la despensa propia; el arroz es el propio, con el código que le faltaba.
    expect(r.writes.locations[0]).toMatchObject({ name: 'Estante alto', parentId: myPantry.id });
    expect(r.writes.items.find((x) => x.id === myRice.id)!.barcode).toBe('7790000000001');
    expect(r.writes.lots[0]).toMatchObject({ itemId: myRice.id, locationId: myPantry.id, quantity: 5 });
    // Recibir lo mismo otra vez (con lo ya guardado) no vuelve a sumar los lotes.
    const after = {
      ...local,
      inventory: inventory({
        categories: local.inventory.categories,
        locations: [myPantry, ...r.writes.locations],
        items: [...r.writes.items],
        lots: r.writes.lots,
      }),
    };
    expect(mergeShare(after, incoming, none()).writes.lots).toHaveLength(0);
  });
});

describe('obra social con varios teléfonos', () => {
  it('el teléfono único de antes pasa a ser el primero de la lista', () => {
    const old = profile({ insurance: { name: 'OSDE', plan: '', memberNumber: '', emergencyPhone: '0810-888-7788' } });
    expect(normalizeProfile({ ...old, insurance: { name: 'OSDE', plan: '', memberNumber: '', emergencyPhone: '0810-888-7788' } }).insurance!.phones).toEqual([
      { label: '', number: '0810-888-7788' },
    ]);
  });

  it('al compartir se suman los teléfonos que falten, sin duplicar', () => {
    const ins = (phones: { label: string; number: string }[]) => ({ name: 'OSDE', plan: '', memberNumber: '', emergencyPhone: phones[0]?.number ?? '', phones });
    const mine = profile({ name: 'Ana', insurance: ins([{ label: 'Emergencias', number: '0810 555 1234' }]) });
    const theirs = profile({ name: 'Ana', insurance: ins([{ label: 'Riesgo de vida', number: '0810-888-7788' }, { label: 'Emergencias', number: '0810-555-1234' }]) });
    const r = mergeShare({ ...empty, profiles: [mine] }, payload({ profiles: [theirs] }), none());
    expect(r.writes.profiles[0]!.insurance!.phones!.map((p) => p.label)).toEqual(['Emergencias', 'Riesgo de vida']);
  });
});

describe('obra social compartida', () => {
  it('la que llega apunta a la misma obra social del familiar (por teléfono) y suma sus teléfonos', () => {
    const myOsde = contact({ kind: 'insurance', name: 'OSDE', phone: '0810-555-1234', phones: [{ label: 'Emergencias', number: '0810-555-1234' }] });
    const theirOsde = contact({
      kind: 'insurance',
      name: 'OSDE',
      phone: '0810 555 1234',
      phones: [
        { label: 'Emergencias', number: '0810 555 1234' },
        { label: 'Riesgo de vida', number: '0810-888-7788' },
      ],
    });
    const insurance = (contactId: string, memberNumber: string) => ({ contactId, name: 'OSDE', plan: '310', memberNumber, emergencyPhone: '', phones: [] });
    const tomi = profile({ name: 'Tomi', insurance: insurance(theirOsde.id, '02') });
    const r = mergeShare({ ...empty, contacts: [myOsde] }, payload({ profiles: [tomi], contacts: [theirOsde] }), none());
    expect(r.newContacts).toBe(0);
    expect(r.writes.contacts[0]!.phones!.map((p) => p.label)).toEqual(['Emergencias', 'Riesgo de vida']);
    expect(r.newProfiles[0]!.insurance).toMatchObject({ contactId: myOsde.id, memberNumber: '02' });
  });
});

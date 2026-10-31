import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { Medication, MedicalProfile, PetHealth, PetSpecies, ProfileKind } from '@/core/model/types';
import { today } from '@/modules/inventory/domain/dates';
import { Segmented } from '@/ui/Segmented';
import { SinglePhoto } from '@/ui/SinglePhoto';
import { emptyPetHealth, monthsSince, useMedical } from './medicalStore';

const BLOOD_TYPES = ['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

function emptyProfile(): MedicalProfile {
  return newEntity<MedicalProfile>({
    kind: 'person',
    pet: null,
    name: '',
    birthDate: null,
    bloodType: '',
    allergies: '',
    conditions: '',
    medications: [],
    emergencyContact: '',
    doctor: '',
    notes: '',
  });
}

export function MedicalEditPage() {
  const { id } = useParams();
  const stored = useMedical((s) => (id ? s.profiles.get(id) : undefined));
  const loaded = useMedical((s) => s.loaded);
  const { t } = useTranslation();

  if (!loaded) return null;
  if (id !== 'new' && !stored) {
    return (
      <p className="empty">
        {t('medical.notFound')} <Link to="/first-aid/medical">{t('common.back')}</Link>
      </p>
    );
  }
  return <ProfileForm key={stored?.id ?? 'new'} stored={stored} />;
}

function ProfilePhoto({ profileId, name }: { profileId: string; name: string }) {
  const photo = useMedical((s) => s.photos.get(profileId));
  const setPhoto = useMedical((s) => s.setPhoto);
  const removePhoto = useMedical((s) => s.removePhoto);
  return (
    <SinglePhoto
      photo={photo}
      alt={name}
      onSet={(image) => setPhoto(profileId, image)}
      onRemove={() => removePhoto(profileId)}
      testId="person-photo-file"
    />
  );
}

function ProfileForm({ stored }: { stored: MedicalProfile | undefined }) {
  const [initial] = useState(() => stored ?? emptyProfile());
  const isNew = !stored;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { saveProfile, deleteProfile } = useMedical();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(false);

  const set = (changes: Partial<MedicalProfile>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setSaved(false);
  };
  const setMed = (index: number, changes: Partial<Medication>) =>
    set({ medications: draft.medications.map((m, i) => (i === index ? { ...m, ...changes } : m)) });
  const isPet = draft.kind === 'pet';
  const pet = draft.pet ?? emptyPetHealth();
  const setPet = (changes: Partial<PetHealth>) => set({ pet: { ...pet, ...changes } });
  // Al pasar a mascota se crean sus datos; si se vuelve a persona, se descartan al guardar.
  const setKind = (kind: ProfileKind) => set({ kind, pet: kind === 'pet' ? (draft.pet ?? emptyPetHealth()) : draft.pet });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveProfile({
      ...draft,
      name: draft.name.trim(),
      pet: isPet ? { ...pet, speciesOther: pet.species === 'other' ? pet.speciesOther.trim() : '' } : null,
      bloodType: isPet ? '' : draft.bloodType,
      // Las filas de medicación vacías no se guardan.
      medications: draft.medications
        .map((m) => ({ name: m.name.trim(), dose: m.dose.trim(), schedule: m.schedule.trim() }))
        .filter((m) => m.name),
    });
    if (isNew) navigate(`/first-aid/medical/${draft.id}`, { replace: true });
    else setSaved(true);
  }

  async function handleDelete() {
    if (!stored || !window.confirm(t('medical.confirmDelete', { name: stored.name }))) return;
    await deleteProfile(stored.id);
    navigate('/first-aid/medical', { replace: true });
  }

  // En mascotas algunos textos cambian ("Veterinario" en lugar de "Médico / obra social").
  const label = (key: string) => t(isPet && i18n.exists(`medical.pet.${key}`) ? `medical.pet.${key}` : `medical.${key}`);
  const text = (key: 'allergies' | 'conditions' | 'emergencyContact' | 'doctor' | 'notes', multiline = true) => (
    <div className="field">
      <label htmlFor={key}>{label(key)}</label>
      {multiline ? (
        <textarea id={key} className="input textarea" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={label(`${key}Placeholder`)} />
      ) : (
        <input id={key} className="input" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={label(`${key}Placeholder`)} />
      )}
    </div>
  );
  const todayStr = today();
  const petDate = (key: 'lastRabiesVaccine' | 'lastSpeciesVaccine' | 'lastDeworming' | 'lastFleaTreatment', labelText: string) => (
    <div className="field">
      <label htmlFor={key}>{labelText}</label>
      <input id={key} className="input" type="date" max={todayStr} value={pet[key] ?? ''} onChange={(e) => setPet({ [key]: e.target.value || null })} />
      {pet[key] && <p className="hint" style={{ margin: 0 }}>{ago(pet[key]!)}</p>}
    </div>
  );
  const ago = (day: string) => {
    const months = monthsSince(day, todayStr);
    return months === 0 ? t('medical.pet.thisMonth') : t('medical.pet.monthsAgo', { count: months });
  };

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid/medical" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('medical.new')}</h1>
      </div>

      {stored ? <ProfilePhoto profileId={stored.id} name={stored.name} /> : <p className="hint">{t('medical.photoAfterSave')}</p>}

      <form className="stack" onSubmit={handleSubmit}>
        <section className="card stack">
          <Segmented<ProfileKind>
            label={t('medical.kind')}
            value={draft.kind}
            options={[
              { value: 'person', label: t('medical.kinds.person') },
              { value: 'pet', label: t('medical.kinds.pet') },
            ]}
            onChange={setKind}
          />
          <div className="field">
            <label htmlFor="name">{t('medical.name')}</label>
            <input id="name" className="input" required value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} />
          </div>
          {isPet && (
            <div className="grid-2">
              <div className="field">
                <label htmlFor="species">{t('medical.pet.species')}</label>
                <select id="species" className="select" value={pet.species} onChange={(e) => setPet({ species: e.target.value as PetSpecies })}>
                  {(['dog', 'cat', 'other'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`medical.pet.speciesOptions.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              {pet.species === 'other' && (
                <div className="field">
                  <label htmlFor="species-other">{t('medical.pet.speciesOther')}</label>
                  <input id="species-other" className="input" value={pet.speciesOther} onChange={(e) => setPet({ speciesOther: e.target.value })} placeholder={t('medical.pet.speciesOtherPlaceholder')} />
                </div>
              )}
            </div>
          )}
          <div className="grid-2">
            <div className="field">
              <label htmlFor="birth">{t('medical.birthDate')}</label>
              <input id="birth" className="input" type="date" value={draft.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value || null })} />
            </div>
            {!isPet && (
              <div className="field">
                <label htmlFor="blood">{t('medical.bloodType')}</label>
                <select id="blood" className="select" value={draft.bloodType} onChange={(e) => set({ bloodType: e.target.value })}>
                  <option value="">{t('medical.unknown')}</option>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {text('allergies')}
          {text('conditions')}
        </section>

        {isPet && (
          <section className="card stack" aria-labelledby="pet-health-title">
            <h2 id="pet-health-title" className="section-title" style={{ margin: 0 }}>{t('medical.pet.healthTitle')}</h2>
            <div className="grid-2">
              {petDate('lastRabiesVaccine', t('medical.pet.lastRabiesVaccine'))}
              {petDate('lastSpeciesVaccine', t(`medical.pet.lastSpeciesVaccine.${pet.species}`))}
              {petDate('lastDeworming', t('medical.pet.lastDeworming'))}
              {petDate('lastFleaTreatment', t('medical.pet.lastFleaTreatment'))}
            </div>
            <div className="field">
              <label htmlFor="neutered">{t('medical.pet.neutered')}</label>
              <select
                id="neutered"
                className="select"
                value={pet.neutered === null ? '' : pet.neutered ? 'yes' : 'no'}
                onChange={(e) => setPet({ neutered: e.target.value === '' ? null : e.target.value === 'yes' })}
              >
                <option value="">{t('medical.unknown')}</option>
                <option value="yes">{t('medical.pet.yes')}</option>
                <option value="no">{t('medical.pet.no')}</option>
              </select>
            </div>
          </section>
        )}

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('medical.medications')}</h2>
          {draft.medications.length === 0 && <p className="hint">{t('medical.noMedications')}</p>}
          {draft.medications.map((m, i) => (
            <fieldset key={i} className="fieldset med-row">
              <legend>{t('medical.medicationN', { n: i + 1 })}</legend>
              <input className="input" aria-label={t('medical.medName')} placeholder={t('medical.medName')} value={m.name} onChange={(e) => setMed(i, { name: e.target.value })} />
              <input className="input" aria-label={t('medical.medDose')} placeholder={t('medical.medDose')} value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} />
              <input className="input" aria-label={t('medical.medSchedule')} placeholder={t('medical.medSchedule')} value={m.schedule} onChange={(e) => setMed(i, { schedule: e.target.value })} />
              <button className="icon-btn" type="button" onClick={() => set({ medications: draft.medications.filter((_, j) => j !== i) })} aria-label={t('medical.removeMedication')} title={t('medical.removeMedication')}>
                <X size={18} />
              </button>
            </fieldset>
          ))}
          <div className="row-end">
            <button className="btn" type="button" onClick={() => set({ medications: [...draft.medications, { name: '', dose: '', schedule: '' }] })}>
              <Plus size={18} /> {t('medical.addMedication')}
            </button>
          </div>
        </section>

        <section className="card stack">
          {text('emergencyContact', false)}
          {text('doctor', false)}
          {text('notes')}
        </section>

        {saved && <p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

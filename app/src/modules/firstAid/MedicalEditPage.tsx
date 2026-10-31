import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { Medication, MedicalProfile } from '@/core/model/types';
import { useMedical } from './medicalStore';

const BLOOD_TYPES = ['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

function emptyProfile(): MedicalProfile {
  return newEntity<MedicalProfile>({
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

function ProfileForm({ stored }: { stored: MedicalProfile | undefined }) {
  const [initial] = useState(() => stored ?? emptyProfile());
  const isNew = !stored;
  const { t } = useTranslation();
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveProfile({
      ...draft,
      name: draft.name.trim(),
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

  const text = (key: 'allergies' | 'conditions' | 'emergencyContact' | 'doctor' | 'notes', multiline = true) => (
    <div className="field">
      <label htmlFor={key}>{t(`medical.${key}`)}</label>
      {multiline ? (
        <textarea id={key} className="input textarea" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={t(`medical.${key}Placeholder`)} />
      ) : (
        <input id={key} className="input" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={t(`medical.${key}Placeholder`)} />
      )}
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid/medical" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('medical.new')}</h1>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <section className="card stack">
          <div className="field">
            <label htmlFor="name">{t('medical.name')}</label>
            <input id="name" className="input" required value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="birth">{t('medical.birthDate')}</label>
              <input id="birth" className="input" type="date" value={draft.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value || null })} />
            </div>
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
          </div>
          {text('allergies')}
          {text('conditions')}
        </section>

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

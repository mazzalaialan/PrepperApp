import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Crosshair, Trash2 } from 'lucide-react';
import { formatDms } from '@/core/geo/geo';
import { currentPosition } from '@/core/geo/useGeolocation';
import type { EmergencyContact } from '@/core/model/types';
import { emptyContact } from './ContactEditPage';
import { useContacts } from './store';

/** Frecuencia de radio propia: la que te dieron en un refugio, un club o una guardería de parque. */
export function FrequencyEditPage() {
  const { id } = useParams();
  const stored = useContacts((s) => (id ? s.contacts.get(id) : undefined));
  const loaded = useContacts((s) => s.loaded);
  const { t } = useTranslation();
  if (!loaded) return null;
  if (id !== 'new' && (!stored || stored.kind !== 'radio')) {
    return (
      <p className="empty">
        {t('radio.notFound')} <Link to="/first-aid/radio">{t('common.back')}</Link>
      </p>
    );
  }
  return <FrequencyForm key={stored?.id ?? 'new'} stored={stored} />;
}

function FrequencyForm({ stored }: { stored: EmergencyContact | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { save, remove } = useContacts();
  const [draft, setDraft] = useState<EmergencyContact>(() => stored ?? { ...emptyContact('radio'), frequency: '', tone: '' });
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const set = (changes: Partial<EmergencyContact>) => setDraft((d) => ({ ...d, ...changes }));

  async function useHere() {
    setLocating(true);
    setGpsError(false);
    try {
      const fix = await currentPosition();
      set({ lat: fix.lat, lon: fix.lon });
    } catch {
      setGpsError(true);
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await save({ ...draft, name: draft.name.trim(), frequency: (draft.frequency ?? '').trim(), tone: (draft.tone ?? '').trim() });
    navigate('/first-aid/radio', { replace: true });
  }

  async function handleDelete() {
    if (!stored || !window.confirm(t('emergency.confirmDelete', { name: stored.name }))) return;
    await remove(stored.id);
    navigate('/first-aid/radio', { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid/radio" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('radio.newFrequency')}</h1>
      </div>
      <form className="card stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">{t('radio.freqName')}</label>
          <input id="name" className="input" required value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('radio.freqNamePlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="frequency">{t('radio.frequency')}</label>
          <input
            id="frequency"
            className="input"
            required
            inputMode="decimal"
            value={draft.frequency ?? ''}
            onChange={(e) => set({ frequency: e.target.value })}
            placeholder={t('radio.frequencyPlaceholder')}
          />
        </div>
        <div className="field">
          <label htmlFor="tone">{t('radio.tone')}</label>
          <input id="tone" className="input" value={draft.tone ?? ''} onChange={(e) => set({ tone: e.target.value })} placeholder={t('radio.tonePlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="notes">{t('emergency.notes')}</label>
          <textarea id="notes" className="input textarea" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={t('radio.notesPlaceholder')} />
        </div>
        <div className="field">
          <span className="field-label">{t('radio.place')}</span>
          {draft.lat !== null && draft.lon !== null ? (
            <p className="hint" style={{ margin: 0 }} data-testid="freq-place">
              {formatDms({ lat: draft.lat, lon: draft.lon }, t('geo.westLetter'))}{' '}
              <button className="btn" type="button" onClick={() => set({ lat: null, lon: null })}>
                {t('radio.removePlace')}
              </button>
            </p>
          ) : (
            <button className="btn" type="button" onClick={() => void useHere()} disabled={locating}>
              <Crosshair size={18} /> {locating ? t('radio.locating') : t('radio.useHere')}
            </button>
          )}
          {gpsError && <p className="error">{t('radio.gpsError')}</p>}
        </div>
        <div className="row-end">
          {stored && (
            <button className="btn btn-danger-outline" type="button" onClick={() => void handleDelete()}>
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

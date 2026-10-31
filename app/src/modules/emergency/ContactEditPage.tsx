import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { ContactKind, EmergencyContact } from '@/core/model/types';
import { CONTACT_KINDS } from './parts';
import { useContacts } from './store';

export function emptyContact(kind: ContactKind = 'other'): EmergencyContact {
  return newEntity<EmergencyContact>({ kind, name: '', phone: '', phone2: '', address: '', lat: null, lon: null, notes: '', source: null });
}

export function ContactEditPage() {
  const { id } = useParams();
  const stored = useContacts((s) => (id ? s.contacts.get(id) : undefined));
  const loaded = useContacts((s) => s.loaded);
  const { t } = useTranslation();
  if (!loaded) return null;
  if (id !== 'new' && !stored) {
    return (
      <p className="empty">
        {t('emergency.notFound')} <Link to="/first-aid/contacts">{t('common.back')}</Link>
      </p>
    );
  }
  return <ContactForm key={stored?.id ?? 'new'} stored={stored} />;
}

function ContactForm({ stored }: { stored: EmergencyContact | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { save, remove } = useContacts();
  const [draft, setDraft] = useState(() => stored ?? emptyContact());
  const set = (changes: Partial<EmergencyContact>) => setDraft((d) => ({ ...d, ...changes }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await save({ ...draft, name: draft.name.trim(), phone: draft.phone.trim(), phone2: draft.phone2.trim(), address: draft.address.trim() });
    navigate('/first-aid/contacts', { replace: true });
  }

  async function handleDelete() {
    if (!stored || !window.confirm(t('emergency.confirmDelete', { name: stored.name }))) return;
    await remove(stored.id);
    navigate('/first-aid/contacts', { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid/contacts" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('emergency.newContact')}</h1>
      </div>
      <form className="card stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="kind">{t('emergency.kindLabel')}</label>
          <select id="kind" className="select" value={draft.kind} onChange={(e) => set({ kind: e.target.value as ContactKind })}>
            {CONTACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`emergency.kind.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="name">{t('emergency.name')}</label>
          <input id="name" className="input" required value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('emergency.namePlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="phone">{t('emergency.phone')}</label>
          <input id="phone" className="input" type="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="phone2">{t('emergency.phone2')}</label>
          <input id="phone2" className="input" type="tel" value={draft.phone2} onChange={(e) => set({ phone2: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="address">{t('emergency.address')}</label>
          <input id="address" className="input" value={draft.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('emergency.addressPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="notes">{t('emergency.notes')}</label>
          <textarea id="notes" className="input textarea" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        {draft.source && <p className="hint" style={{ margin: 0 }}>{t('emergency.sourceNote', { source: draft.source })}</p>}
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

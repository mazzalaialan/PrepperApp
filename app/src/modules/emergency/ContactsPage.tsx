import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Search } from 'lucide-react';
import { NATIONAL_NUMBERS } from './national';
import { KindIcon, MapLink, PhoneActions } from './parts';
import { useContacts } from './store';

export function ContactsPage() {
  const { t, i18n } = useTranslation();
  const contacts = useContacts((s) => s.contacts);
  // Las frecuencias de radio se ven en Radio.
  const mine = useMemo(
    () => [...contacts.values()].filter((c) => c.kind !== 'radio').sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [contacts, i18n.language],
  );

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.contacts.title')}</h1>
      </div>

      <section className="card stack" aria-labelledby="national-title">
        <h2 id="national-title" className="section-title" style={{ margin: 0 }}>{t('emergency.nationalTitle')}</h2>
        <ul className="list contact-list">
          {NATIONAL_NUMBERS.map((n) => (
            <li key={n.id} className="contact-row" data-testid={`national-${n.id}`}>
              <KindIcon kind={n.kind} />
              <span className="list-main">
                <span className="list-title">{t(`emergency.national.${n.id}.name`)}</span>
                <span className="list-sub">{t(`emergency.national.${n.id}.desc`)}</span>
              </span>
              <PhoneActions phone={n.number} />
            </li>
          ))}
        </ul>
        <p className="hint" style={{ margin: 0 }}>{t('emergency.localNote')}</p>
      </section>

      <section className="card stack" aria-labelledby="mine-title">
        <h2 id="mine-title" className="section-title" style={{ margin: 0 }}>{t('emergency.mineTitle')}</h2>
        <div className="row-end wrap">
          <Link className="btn" to="/first-aid/contacts/nearby">
            <Search size={18} /> {t('emergency.searchNearby')}
          </Link>
          <Link className="btn btn-primary" to="/first-aid/contacts/new">
            <Plus size={20} /> {t('emergency.newContact')}
          </Link>
        </div>
        {mine.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>{t('emergency.noContacts')}</p>
        ) : (
          <ul className="list contact-list" data-testid="my-contacts">
            {mine.map((c) => (
              <li key={c.id} className="contact-row">
                <KindIcon kind={c.kind} />
                <span className="list-main">
                  <span className="list-title">{c.name}</span>
                  <span className="list-sub">{t(`emergency.kind.${c.kind}`)}</span>
                  <MapLink address={c.address} lat={c.lat} lon={c.lon} />
                  {c.notes && <span className="list-sub">{c.notes}</span>}
                </span>
                <span className="contact-actions">
                  <PhoneActions phone={c.phone} />
                  {c.phone2 && <PhoneActions phone={c.phone2} />}
                  <Link className="icon-btn" to={`/first-aid/contacts/${c.id}`} aria-label={t('emergency.editContact', { name: c.name })}>
                    <Pencil size={18} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

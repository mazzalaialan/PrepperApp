import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Search, User } from 'lucide-react';
import { ageOn, useMedical } from '@/modules/firstAid/medicalStore';
import { today } from '@/modules/inventory/domain/dates';
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

      <FamilySection />

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

/** Mayor de edad: a quién tiene sentido llamar en una emergencia. */
const ADULT_AGE = 18;

/** Personas de las fichas médicas, de mayor a menor edad, con su parentesco. */
function FamilySection() {
  const { t, i18n } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const todayStr = today();
  const people = useMemo(
    () =>
      [...profiles.values()]
        .filter((p) => p.kind === 'person' && p.inContacts !== false)
        .map((p) => ({ p, age: p.birthDate ? ageOn(p.birthDate, todayStr) : null }))
        // Sin fecha de nacimiento, entre los adultos y los menores (no se sabe).
        .sort((a, b) => (b.age ?? ADULT_AGE - 0.5) - (a.age ?? ADULT_AGE - 0.5) || a.p.name.localeCompare(b.p.name, i18n.language)),
    [profiles, todayStr, i18n.language],
  );
  if (people.length === 0) return null;

  return (
    <section className="card stack" aria-labelledby="family-title">
      <h2 id="family-title" className="section-title" style={{ margin: 0 }}>{t('emergency.familyTitle')}</h2>
      <ul className="list contact-list" data-testid="family-contacts">
        {people.map(({ p, age }) => {
          const minor = age !== null && age < ADULT_AGE;
          return (
            <li key={p.id} className="contact-row" data-minor={minor}>
              <User size={22} aria-hidden className="contact-icon" />
              <span className="list-main">
                <span className="list-title">{p.name}</span>
                <span className="list-sub">
                  {[p.relationship, age !== null ? t('medical.age', { count: age }) : null, minor ? t('emergency.minor') : null].filter(Boolean).join(' · ')}
                </span>
                {!p.phone && <span className="list-sub">{t('emergency.familyNoPhone')}</span>}
              </span>
              <span className="contact-actions">
                {p.phone && <PhoneActions phone={p.phone} />}
                <Link className="icon-btn" to={`/first-aid/medical/${p.id}`} aria-label={t('emergency.openMedical', { name: p.name })}>
                  <Pencil size={18} />
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('emergency.familyHint')}</p>
    </section>
  );
}

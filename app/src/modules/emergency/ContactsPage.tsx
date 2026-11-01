import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Search, User } from 'lucide-react';
import { ageOn, useMedical } from '@/modules/firstAid/medicalStore';
import { medScheduleText, resolveEmergencyContacts } from '@/modules/firstAid/medText';
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

      <MyDataSection />

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

/** Mi ficha ("Soy yo"): lo que necesita saber quien me asiste, arriba de todo. */
function MyDataSection() {
  const { t } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const me = useMemo(() => [...profiles.values()].find((p) => p.kind === 'person' && p.isMe), [profiles]);
  const loaded = useMedical((s) => s.loaded);
  if (!loaded) return null;
  if (!me) {
    return (
      <p className="hint" data-testid="my-data-missing">
        {t('emergency.myDataMissing')} <Link to="/first-aid/medical">{t('emergency.myDataGo')}</Link>
      </p>
    );
  }
  const age = me.birthDate ? ageOn(me.birthDate, today()) : null;
  const contacts = resolveEmergencyContacts(me, profiles);
  const rows: [string, string][] = [
    [t('medical.bloodType'), me.bloodType],
    [t('medical.allergies'), me.allergies],
    [t('medical.conditions'), me.conditions],
    [t('medical.doctor'), me.doctor],
  ];
  return (
    <section className="card stack my-data" aria-labelledby="my-data-title" data-testid="my-data">
      <div className="row-between">
        <h2 id="my-data-title" className="section-title" style={{ margin: 0 }}>{t('emergency.myDataTitle')}</h2>
        <Link className="icon-btn" to={`/first-aid/medical/${me.id}`} aria-label={t('emergency.openMedical', { name: me.name })}>
          <Pencil size={18} />
        </Link>
      </div>
      <p className="my-data-name">
        <strong>{me.name}</strong>
        {age !== null && ` · ${t('medical.age', { count: age })}`}
      </p>
      <dl className="my-data-list">
        {rows
          .filter(([, value]) => value.trim())
          .map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        {me.medications.length > 0 && (
          <>
            <dt>{t('medical.medications')}</dt>
            <dd>
              <ul className="my-data-meds">
                {me.medications.map((m, i) => (
                  <li key={i}>
                    <strong>{[m.name, m.dose].filter(Boolean).join(' ')}</strong>
                    {[medScheduleText(m, t), m.schedule].filter(Boolean).map((s) => ` · ${s}`)}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {contacts.length > 0 && (
          <>
            <dt>{t('medical.emergencyContacts')}</dt>
            {contacts.map((c, i) => (
              <dd key={i} data-testid="my-emergency-contact">
                {c.label}
                {c.phone && <PhoneActions phone={c.phone} />}
              </dd>
            ))}
          </>
        )}
      </dl>
    </section>
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
        .filter((p) => p.kind === 'person' && p.inContacts !== false && !p.isMe)
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
                {resolveEmergencyContacts(p, profiles).map((c, i) => (
                  <span key={i} className="family-ec" data-testid="family-emergency-contact">
                    <span className="list-sub">{t('emergency.familyContact', { name: c.label })}</span>
                    {c.phone && <PhoneActions phone={c.phone} />}
                  </span>
                ))}
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

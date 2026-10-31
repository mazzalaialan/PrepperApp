import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Radio } from 'lucide-react';
import { distanceMeters } from '@/core/geo/geo';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { loadEmergencyData, nearestRadio, type EmergencyData } from './data';
import { CopyButton, formatDistance, MapLink } from './parts';
import { useContacts } from './store';

/**
 * Radio en una emergencia: la emisora de Radio Nacional más cercana (para
 * informarse con una radio a pilas) y las frecuencias internacionales de
 * socorro. No incluye frecuencias de fuerzas de seguridad: no son públicas,
 * muchas están cifradas y captarlas sin autorización puede ser delito.
 */
const DISTRESS = [
  { id: 'marine', freq: '156,800 MHz' },
  { id: 'air', freq: '121,500 MHz' },
] as const;

export function RadioPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const [data, setData] = useState<EmergencyData | null>(null);
  useEffect(() => {
    void loadEmergencyData().then(setData);
  }, []);
  const stations = useMemo(() => (data && place ? nearestRadio(data, place.lat, place.lon) : []), [data, place?.lat, place?.lon]);
  const fm = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const contacts = useContacts((s) => s.contacts);
  // Mis frecuencias: las que tienen lugar, de la más cercana a la más lejana; después el resto por nombre.
  const mine = useMemo(() => {
    const list = [...contacts.values()].filter((c) => c.kind === 'radio');
    const dist = (c: (typeof list)[number]) => (place && c.lat !== null && c.lon !== null ? distanceMeters(place, { lat: c.lat, lon: c.lon }) : null);
    return list
      .map((c) => ({ c, d: dist(c) }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.c.name.localeCompare(b.c.name, i18n.language));
  }, [contacts, place?.lat, place?.lon, i18n.language]);

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.radio.title')}</h1>
      </div>

      <section className="card stack" aria-labelledby="mine-freq-title">
        <h2 id="mine-freq-title" className="section-title" style={{ margin: 0 }}>{t('radio.mineTitle')}</h2>
        {mine.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('radio.mineEmpty')}</p>
        ) : (
          <ul className="list" data-testid="my-frequencies">
            {mine.map(({ c, d }) => (
              <li key={c.id} className="contact-row">
                <Radio size={22} aria-hidden className="contact-icon" />
                <span className="list-main">
                  <span className="list-title">{c.name}</span>
                  <span className="list-sub">{[c.tone, d !== null && t('radio.distance', { distance: formatDistance(d, i18n.language) })].filter(Boolean).join(' · ')}</span>
                  {c.notes && <span className="list-sub">{c.notes}</span>}
                  {c.lat !== null && <MapLink address="" lat={c.lat} lon={c.lon} />}
                </span>
                <span className="contact-actions">
                  <strong className="radio-freqs">{c.frequency}</strong>
                  <CopyButton text={[c.frequency, c.tone].filter(Boolean).join(' ')} label={t('radio.copyFrequency', { name: c.name })} />
                  <Link className="icon-btn" to={`/first-aid/radio/${c.id}`} aria-label={t('emergency.editContact', { name: c.name })}>
                    <Pencil size={18} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link className="btn btn-primary" to="/first-aid/radio/new">
          <Plus size={20} /> {t('radio.newFrequency')}
        </Link>
      </section>

      <section className="card stack" aria-labelledby="rn-title">
        <h2 id="rn-title" className="section-title" style={{ margin: 0 }}>{t('radio.nacionalTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('radio.nacionalHint')}</p>
        {picker}
        {!place ? (
          <p className="empty">{t('emergency.needPlace')}</p>
        ) : (
          <ul className="list" data-testid="radio-stations">
            {stations.map((s, i) => (
              <li key={s.call} className="contact-row">
                <Radio size={22} aria-hidden className={i === 0 ? 'contact-icon contact-icon-fire' : 'contact-icon'} />
                <span className="list-main">
                  <span className="list-title">
                    {s.call} · {s.city}
                  </span>
                  <span className="list-sub">
                    {[s.province, t('radio.distance', { distance: formatDistance(s.distance, i18n.language) })].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="radio-freqs">
                  {s.am !== null && <strong>AM {s.am}</strong>}
                  {s.fm !== null && <strong>FM {fm.format(s.fm)}</strong>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ margin: 0 }}>{t('radio.nacionalNote')}</p>
      </section>

      <section className="card stack" aria-labelledby="distress-title">
        <h2 id="distress-title" className="section-title" style={{ margin: 0 }}>{t('radio.distressTitle')}</h2>
        <ul className="list">
          {DISTRESS.map((d) => (
            <li key={d.id} className="contact-row">
              <span className="list-main">
                <span className="list-title">{t(`radio.distress.${d.id}.name`)}</span>
                <span className="list-sub">{t(`radio.distress.${d.id}.desc`)}</span>
              </span>
              <strong className="radio-freqs">{d.freq}</strong>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ margin: 0 }}>{t('radio.distressNote')}</p>
      </section>

      <section className="card stack" aria-labelledby="ham-title">
        <h2 id="ham-title" className="section-title" style={{ margin: 0 }}>{t('radio.hamTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('radio.hamText')}</p>
      </section>

      <p className="hint">{t('radio.securityNote')}</p>
    </div>
  );
}

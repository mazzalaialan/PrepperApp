import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Radio } from 'lucide-react';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { loadEmergencyData, nearestRadio, type EmergencyData } from './data';
import { formatDistance } from './parts';

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

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/first-aid" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.radio.title')}</h1>
      </div>

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

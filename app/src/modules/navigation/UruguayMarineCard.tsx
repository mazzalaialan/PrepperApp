import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { usePlaceCountries } from '@/modules/emergency/usePlaceCountry';
import { fetchUyMarine, loadSavedUy, saveUy, type UyMarineNotice } from './uruguayMarine';

/** ¿Dentro del Río de la Plata (orillas de Argentina y Uruguay) o del río Uruguay bajo? */
const inEstuary = (lat: number, lon: number) => lat <= -30.5 && lat >= -36.5 && lon >= -61 && lon <= -53;

/** Aviso marino oficial de INUMET para el Río de la Plata y el río Uruguay (Uruguay, a menos de 50 km de su frontera o en el estuario). */
export function UruguayMarineCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const { country, near } = usePlaceCountries(place);
  const relevant = country === 'UY' || near.includes('UY') || (!!place && inEstuary(place.lat, place.lon));
  const [notice, setNotice] = useState<UyMarineNotice | null>(() => loadSavedUy());
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  useEffect(() => {
    if (!relevant) return;
    if (!navigator.onLine) {
      setState('error');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchUyMarine().then(
      (n) => {
        if (cancelled) return;
        if (n) {
          saveUy(n);
          setNotice(n);
        }
        setState('ok');
      },
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [relevant]);

  if (!relevant) return null;
  return (
    <section className="card stack" aria-labelledby="uy-title" data-testid="uy-card">
      <h2 id="uy-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.uruguay.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.uruguay.intro')}
      </p>
      {state === 'loading' && !notice && <p className="hint">{t('navigation.uruguay.loading')}</p>}
      {state === 'error' && (
        <p className={notice ? 'hint' : 'error'} data-testid="uy-offline">
          {notice ? t('navigation.uruguay.offlineSaved', { when: new Date(notice.fetchedAt).toLocaleString(i18n.language) }) : t('navigation.uruguay.error')}
        </p>
      )}
      {notice && (
        <>
          <p style={{ margin: 0 }} data-testid="uy-issued">
            {t('navigation.uruguay.issued', { when: notice.issued, from: notice.validFrom })}
          </p>
          {!notice.active || notice.warnings.length === 0 ? (
            <p className="hint" data-testid="uy-none">
              {t('navigation.uruguay.none')}
            </p>
          ) : (
            <ul className="list" data-testid="uy-warnings">
              {notice.warnings.map((w) => (
                <li key={`${w.zone}-${w.kind}`} className="list-row">
                  <span className="list-main">
                    <span className="list-title">
                      {w.zone} · {w.kind}
                    </span>
                    <span className="list-sub">{w.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {notice.synoptic && (
            <>
              <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
                {t('navigation.uruguay.synoptic')}
              </h3>
              <p style={{ margin: 0 }} data-testid="uy-synoptic">
                {notice.synoptic}
              </p>
            </>
          )}
        </>
      )}
      <p className="hint" style={{ margin: 0 }} data-testid="uy-source">
        {t('navigation.uruguay.source')}
      </p>
    </section>
  );
}

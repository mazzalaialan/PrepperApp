import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import {
  fetchReadings,
  loadRivers,
  loadSavedReadings,
  nearestRivers,
  riverState,
  saveReadings,
  type RiverReading,
  type RiversData,
  type RiverState,
} from './rivers';

const STATE_CLASS: Record<RiverState, string> = { evac: 'river-evac', alert: 'river-alert', low: 'river-low', normal: 'river-ok' };

/** Niveles de los ríos de Argentina cerca del lugar elegido (INA), con sus umbrales de alerta. */
export function RiversCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<RiversData | null>(null);
  const [failed, setFailed] = useState(false);
  const [readings, setReadings] = useState<Map<number, RiverReading>>(() => loadSavedReadings());
  const [live, setLive] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  useEffect(() => {
    void loadRivers().then(setData, () => setFailed(true));
  }, []);

  const near = useMemo(() => (data && place ? nearestRivers(data.stations, place.lat, place.lon) : []), [data, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = near.map((n) => n.station.series).join(',');
  // Con conexión se piden los niveles al INA; sin conexión (o si falla) quedan los últimos guardados.
  useEffect(() => {
    if (!near.length) return;
    if (!navigator.onLine) {
      setLive('error');
      return;
    }
    let cancelled = false;
    setLive('loading');
    fetchReadings(near.map((n) => n.station.series)).then(
      (fresh) => {
        if (cancelled) return;
        saveReadings(fresh);
        setReadings((prev) => new Map([...prev, ...fresh]));
        setLive('ok');
      },
      () => !cancelled && setLive('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const ago = (iso: string) => {
    const h = (Date.now() - Date.parse(iso)) / 3_600_000;
    if (h < 1) return t('navigation.rivers.agoMinutes', { n: Math.max(1, Math.round(h * 60)) });
    if (h < 48) return t('navigation.rivers.agoHours', { n: Math.round(h) });
    return t('navigation.rivers.agoDays', { n: Math.round(h / 24) });
  };

  return (
    <section className="card stack" aria-labelledby="rivers-title" data-testid="rivers-card">
      <h2 id="rivers-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.rivers.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.rivers.intro')}
      </p>
      {failed && <p className="error">{t('navigation.rivers.unavailable')}</p>}
      {data && place && near.length === 0 && (
        <p className="hint" data-testid="rivers-none">
          {t('navigation.rivers.none')}
        </p>
      )}
      {live === 'error' && near.length > 0 && (
        <p className="hint" data-testid="rivers-offline">
          {t('navigation.rivers.offline')}
        </p>
      )}
      <ul className="list" data-testid="rivers-list">
        {near.map(({ station: s, km: dist }) => {
          const r = readings.get(s.series);
          const state = r ? riverState(r.level, s) : null;
          return (
            <li key={s.id} className="list-row river-row" data-testid={`river-${s.id}`}>
              <span className="list-main">
                <span className="list-title">
                  {s.name} <span className="hint">· {s.river}</span>
                </span>
                <span className="list-sub">
                  {t('navigation.rivers.distance', { km: km.format(dist) })}
                  {r ? ` · ${t('navigation.rivers.measured', { ago: ago(r.at) })}` : ''}
                </span>
                <span className="list-sub">
                  {[
                    s.alert !== null && t('navigation.rivers.thresholdAlert', { m: nf.format(s.alert) }),
                    s.evac !== null && t('navigation.rivers.thresholdEvac', { m: nf.format(s.evac) }),
                    s.low !== null && t('navigation.rivers.thresholdLow', { m: nf.format(s.low) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="list-end river-level">
                {r && state ? (
                  <>
                    <strong>{nf.format(r.level)} m</strong>
                    <span className={`chip-state ${STATE_CLASS[state]}`} data-testid={`river-state-${s.id}`}>
                      {t(`navigation.rivers.state.${state}`)}
                    </span>
                    {r.change !== null && (
                      <span className="hint">
                        {sf.format(r.change)} m {t('navigation.rivers.perDay')}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="hint">{live === 'loading' ? t('navigation.rivers.loading') : t('navigation.rivers.noReading')}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {near.length > 0 && (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.rivers.reference')}
          </p>
          <p className="hint" style={{ margin: 0 }} data-testid="rivers-source">
            {t('navigation.rivers.source', { source: data?.source ?? 'INA' })}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.rivers.alerts')}
          </p>
        </>
      )}
    </section>
  );
}

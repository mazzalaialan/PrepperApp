import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchForecasts, loadSavedForecasts, saveForecasts, summarize, type StationForecast } from '@/modules/navigation/forecast';
import type { RiverStation } from '@/modules/navigation/rivers';

/** Pronóstico del INA de una estación, al tocarla en el mapa: se pide solo el modelo de esa estación (los hay de casi 1 MB). */
export function RiverForecastLine({ station, now }: { station: RiverStation; now: number }) {
  const { t, i18n } = useTranslation();
  const [forecast, setForecast] = useState<StationForecast | null>(() => loadSavedForecasts().get(station.id) ?? null);
  useEffect(() => {
    setForecast(loadSavedForecasts().get(station.id) ?? null);
    if (!navigator.onLine) return;
    let cancelled = false;
    void fetchForecasts([station]).then((m) => {
      const f = m.get(station.id);
      if (cancelled || !f) return;
      saveForecasts(m);
      setForecast(f);
    });
    return () => {
      cancelled = true;
    };
  }, [station]);
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const at = (ms: number) => new Date(ms).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const sum = forecast ? summarize(forecast, station, now) : null;
  if (!sum) return <p className="hint" style={{ margin: 0 }}>{t('navigation.rivers.forecast.loading')}</p>;
  return (
    <p className="hint" style={{ margin: 0 }} data-testid="map-river-forecast">
      {t('navigation.rivers.forecast.peak', { max: nf.format(sum.peak.v), maxAt: at(sum.peak.t), min: nf.format(sum.trough.v), minAt: at(sum.trough.t) })}{' '}
      {sum.first
        ? t(sum.first.band ? 'navigation.rivers.forecast.reachBand' : 'navigation.rivers.forecast.reach', {
            what: t(`navigation.rivers.forecast.what.${sum.first.kind}`),
            m: nf.format(station[sum.first.kind] ?? 0),
            when: at(sum.first.t),
          })
        : t('navigation.rivers.forecast.none')}
    </p>
  );
}

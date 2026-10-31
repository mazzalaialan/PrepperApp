import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Gauge,
  RefreshCw,
  Sun,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { cardinalOf } from '@/core/geo/geo';
import { useSettings } from '@/core/settings/settings';
import type { UnitSystem } from '@/core/units/units';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { cachedForecast, placeKey, storeForecast } from './cache';
import { fetchForecast, kmhToMph, mmToInch, skyOf, toFahrenheit, warningsOf, WeatherError, type Forecast, type Sky } from './forecast';

/** Con conexión, un pronóstico más viejo que esto se actualiza solo al abrir la pantalla. */
const STALE_MS = 60 * 60_000;

const SKY_ICON: Record<Sky, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

function SkyIcon({ code, size = 24 }: { code: number; size?: number }) {
  const { t } = useTranslation();
  const sky = skyOf(code);
  const Icon = SKY_ICON[sky];
  return <Icon size={size} aria-label={t(`weather.sky.${sky}`)} role="img" className="sky-icon" />;
}

function useUnits(system: UnitSystem, locale: string) {
  const n0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const imperial = system === 'imperial';
  return {
    temp: (c: number) => `${n0.format(imperial ? toFahrenheit(c) : c)}°`,
    wind: (kmh: number) => (imperial ? `${n0.format(kmhToMph(kmh))} mph` : `${n0.format(kmh)} km/h`),
    rain: (mm: number) => (imperial ? `${n1.format(mmToInch(mm))} in` : `${n1.format(mm)} mm`),
  };
}

export function WeatherPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const base = useSettings((s) => s.settings.weatherUrl);
  const system = useSettings((s) => s.settings.units);
  const u = useUnits(system, i18n.language);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WeatherError['code'] | null>(null);

  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const key = lat === null || lon === null ? null : placeKey(lat, lon);

  const refresh = useCallback(async () => {
    if (lat === null || lon === null || !key) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchForecast(base, lat, lon);
      await storeForecast(key, fresh);
      setForecast(fresh);
    } catch (e) {
      setError(e instanceof WeatherError ? e.code : 'unreachable');
    } finally {
      setLoading(false);
    }
    // Depende de la celda del lugar (`key`), no de cada metro que se mueve el GPS.
  }, [key, base]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setForecast(null);
    setError(null);
    void cachedForecast(key).then((cached) => {
      if (cancelled) return;
      setForecast(cached);
      const stale = !cached || Date.now() - Date.parse(cached.fetchedAt) > STALE_MS;
      if (stale && navigator.onLine) void refresh();
      else if (!cached && !navigator.onLine) setError('offline');
    });
    return () => {
      cancelled = true;
    };
  }, [key, refresh]);

  const ago = forecast ? relativeAgo(forecast.fetchedAt, i18n.language) : null;
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayLabel = (iso: string, i: number) => (i === 0 ? t('weather.today') : dayFmt.format(new Date(`${iso}T12:00:00Z`)));
  const hours = forecast ? forecast.hourly.filter((h) => h.time >= forecast.current.time.slice(0, 13)).slice(0, 24) : [];
  const warnings = forecast ? warningsOf(forecast.daily) : [];

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.weather.title')}</h1>
      {picker}

      {key && (
        <div className="weather-status">
          <span className="hint" data-testid="weather-updated">
            {loading ? t('weather.loading') : ago ? t('weather.updated', { ago }) : null}
          </span>
          <button className="btn" type="button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={18} /> {t('weather.refresh')}
          </button>
        </div>
      )}
      {error && (
        <p className={forecast ? 'hint' : 'error'} role="status">
          {t(`weather.error.${error}`)}
          {forecast && ` ${t('weather.showingCached')}`}
        </p>
      )}

      {!place ? (
        <p className="empty">{t('sky.needPlace')}</p>
      ) : !forecast ? null : (
        <>
          <section className="card weather-now" aria-label={t('weather.now')}>
            <SkyIcon code={forecast.current.code} size={56} />
            <div>
              <p className="weather-temp" data-testid="weather-temp">{u.temp(forecast.current.temperature)}</p>
              <p className="hint" style={{ margin: 0 }}>
                {t(`weather.sky.${skyOf(forecast.current.code)}`)} · {t('weather.feelsLike', { temp: u.temp(forecast.current.apparent) })}
              </p>
            </div>
            <ul className="weather-facts">
              <li>
                <Wind size={16} aria-hidden /> {u.wind(forecast.current.windSpeed)} {t(`geo.cardinal.${cardinalOf(forecast.current.windDirection)}`)}
                {' · '}
                {t('weather.gusts', { value: u.wind(forecast.current.windGusts) })}
              </li>
              <li>
                <Droplets size={16} aria-hidden /> {t('weather.humidity', { pct: Math.round(forecast.current.humidity) })}
              </li>
              <li>
                <Gauge size={16} aria-hidden /> {t('weather.pressure', { hpa: Math.round(forecast.current.pressure) })}
              </li>
            </ul>
          </section>

          {warnings.length > 0 && (
            <section className="card stack weather-warnings" aria-labelledby="warn-title">
              <h2 id="warn-title" className="section-title" style={{ margin: 0 }}>
                <TriangleAlert size={18} aria-hidden /> {t('weather.warningsTitle')}
              </h2>
              <ul className="list">
                {warnings.map((w) => (
                  <li key={`${w.kind}-${w.date}`} className="list-row">
                    <span className="list-main">
                      <span className="list-title">{t(`weather.warning.${w.kind}`, { value: w.kind === 'frost' || w.kind === 'heat' ? u.temp(w.value) : w.kind === 'gusts' ? u.wind(w.value) : w.kind === 'heavyRain' ? u.rain(w.value) : Math.round(w.value) })}</span>
                    </span>
                    <span className="list-sub">{dayLabel(w.date, forecast.daily.findIndex((d) => d.date === w.date))}</span>
                  </li>
                ))}
              </ul>
              <p className="hint" style={{ margin: 0 }}>{t('weather.warningsNote')}</p>
            </section>
          )}

          <section className="card stack" aria-labelledby="hours-title">
            <h2 id="hours-title" className="section-title" style={{ margin: 0 }}>{t('weather.next24')}</h2>
            <ol className="hour-strip">
              {hours.map((h) => (
                <li key={h.time}>
                  <span className="hint">{h.time.slice(11, 16)}</span>
                  <SkyIcon code={h.code} />
                  <strong>{u.temp(h.temperature)}</strong>
                  {h.precipProbability !== null && h.precipProbability > 0 && <span className="hint">{h.precipProbability}%</span>}
                </li>
              ))}
            </ol>
          </section>

          <section className="card stack" aria-labelledby="days-title">
            <h2 id="days-title" className="section-title" style={{ margin: 0 }}>{t('weather.next7')}</h2>
            <ul className="list">
              {forecast.daily.map((d, i) => (
                <li key={d.date} className="list-row day-row">
                  <span className="day-name">{dayLabel(d.date, i)}</span>
                  <SkyIcon code={d.code} />
                  <span className="list-main">
                    <span className="list-title">
                      {u.temp(d.min)} / {u.temp(d.max)}
                    </span>
                    <span className="list-sub">
                      {d.precipitation > 0 ? u.rain(d.precipitation) : t('weather.noRain')}
                      {d.precipProbability !== null && d.precipProbability > 0 && ` (${d.precipProbability}%)`}
                      {' · '}
                      {t('weather.gusts', { value: u.wind(d.gustMax) })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <p className="hint">{t('weather.source', { place: place.label })}</p>
        </>
      )}
    </div>
  );
}

function relativeAgo(iso: string, locale: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

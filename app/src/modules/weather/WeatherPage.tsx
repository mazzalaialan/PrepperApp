import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowUp,
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
import { useWaypoints } from '@/modules/waypoints/store';
import { cachedForecast, placeKey, storeForecast } from './cache';
import { RAIN_MM_PER_SLOT, rainOutlook, type RainSlot } from './nowcast';
import { HERE_ID, useRainWatch } from './rainWatch';
import { fetchForecast, kmhToMph, mmToInch, RELIABLE_DAYS, skyOf, toFahrenheit, warningsOf, WeatherError, type Forecast, type Sky } from './forecast';

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
    /** Solo el número (la unidad va en la leyenda, para que entre en cada hora). */
    windValue: (kmh: number) => n0.format(imperial ? kmhToMph(kmh) : kmh),
    windUnit: imperial ? 'mph' : 'km/h',
    rain: (mm: number) => (imperial ? `${n1.format(mmToInch(mm))} in` : `${n1.format(mm)} mm`),
  };
}

type Units = ReturnType<typeof useUnits>;

/** Flecha hacia donde sopla el viento (el dato viene como "de dónde viene"). */
function WindArrow({ from, size = 16 }: { from: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <ArrowUp
      size={size}
      className="wind-arrow"
      style={{ transform: `rotate(${(from + 180) % 360}deg)` }}
      role="img"
      aria-label={t('weather.windFrom', { dir: t(`geo.cardinal.${cardinalOf(from)}`) })}
    />
  );
}

function DayList({
  days,
  offset,
  dayLabel,
  u,
  trend = false,
}: {
  days: Forecast['daily'];
  offset: number;
  dayLabel: (iso: string, i: number) => string;
  u: Units;
  trend?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ul className="list" data-trend={trend}>
      {days.map((d, i) => (
        <li key={d.date} className="list-row day-row" data-testid={trend ? 'trend-day' : 'day'}>
          <span className="day-name">{dayLabel(d.date, i + offset)}</span>
          <SkyIcon code={d.code} />
          <span className="list-main">
            <span className="list-title">
              {u.temp(d.min)} / {u.temp(d.max)}
            </span>
            <span className="list-sub">
              <Droplets size={13} aria-hidden /> {d.precipitation > 0 ? u.rain(d.precipitation) : t('weather.noRain')}
              {d.precipProbability !== null && d.precipProbability > 0 && ` (${d.precipProbability}%)`}
            </span>
            <span className="list-sub">
              {d.windDirection != null && <WindArrow from={d.windDirection} size={13} />} {t('weather.windDay', { speed: u.wind(d.windMax), gusts: u.wind(d.gustMax) })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
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
  // Los avisos se calculan sobre los días confiables; la tendencia lejana generaría falsas alarmas.
  const warnings = forecast ? warningsOf(forecast.daily.slice(0, RELIABLE_DAYS)) : [];

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

          {forecast.minutely15 && forecast.minutely15.length > 0 && (
            <NextRain now={forecast.current.time} slots={forecast.minutely15} system={system} />
          )}

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
            <p className="hint hour-legend" style={{ margin: 0 }}>
              <Droplets size={14} aria-hidden /> {t('weather.legendRain')} · <Wind size={14} aria-hidden /> {t('weather.legendWind', { unit: u.windUnit })}
            </p>
            <ol className="hour-strip">
              {hours.map((h) => (
                <li key={h.time} data-testid="hour">
                  <span className="hint">{h.time.slice(11, 16)}</span>
                  <SkyIcon code={h.code} />
                  <strong>{u.temp(h.temperature)}</strong>
                  <span className="hour-rain" data-wet={(h.precipProbability ?? 0) > 0} aria-label={t('weather.rainChance', { pct: h.precipProbability ?? 0 })}>
                    <Droplets size={13} aria-hidden />
                    {h.precipProbability ?? 0}%
                  </span>
                  <span className="hour-wind" aria-label={t('weather.windAria', { speed: u.windValue(h.windSpeed), gusts: h.windGusts === null ? '—' : u.windValue(h.windGusts), unit: u.windUnit })}>
                    {h.windDirection !== null && <WindArrow from={h.windDirection} size={14} />}
                    {u.windValue(h.windSpeed)}
                  </span>
                  {h.windGusts !== null && <span className="hint hour-gust">{t('weather.gustShort', { value: u.windValue(h.windGusts) })}</span>}
                </li>
              ))}
            </ol>
          </section>

          <section className="card stack" aria-labelledby="days-title">
            <h2 id="days-title" className="section-title" style={{ margin: 0 }}>{t('weather.nextDays', { count: Math.min(RELIABLE_DAYS, forecast.daily.length) })}</h2>
            <DayList days={forecast.daily.slice(0, RELIABLE_DAYS)} offset={0} dayLabel={dayLabel} u={u} />
            {forecast.daily.length > RELIABLE_DAYS && (
              <>
                <h3 className="section-title trend-title" style={{ margin: '8px 0 0' }}>{t('weather.trend', { from: RELIABLE_DAYS + 1, to: forecast.daily.length })}</h3>
                <p className="hint" style={{ margin: 0 }}>{t('weather.trendHint')}</p>
                <DayList days={forecast.daily.slice(RELIABLE_DAYS)} offset={RELIABLE_DAYS} dayLabel={dayLabel} u={u} trend />
              </>
            )}
          </section>
          <p className="hint">{t('weather.source', { place: place.label })}</p>
        </>
      )}

      <RainAlertsSettings />
    </div>
  );
}

/** Lluvia de las próximas 2 horas, en barras de 15 minutos. */
function NextRain({ now, slots, system }: { now: string; slots: RainSlot[]; system: UnitSystem }) {
  const { t, i18n } = useTranslation();
  const outlook = rainOutlook({ now, slots });
  const mm = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const amount = (v: number) => (system === 'imperial' ? `${mm.format(mmToInch(v))} in` : `${mm.format(v)} mm`);
  const max = Math.max(1, ...slots.map((s) => s.mm));
  return (
    <section className="card stack" aria-labelledby="next-rain-title">
      <h2 id="next-rain-title" className="section-title" style={{ margin: 0 }}>{t('rainAlerts.nextTitle')}</h2>
      <p className="sky-big" data-testid="next-rain">
        {outlook.state === 'dry'
          ? t('rainAlerts.dry')
          : outlook.state === 'raining'
            ? t('rainAlerts.raining', { amount: amount(outlook.mm) })
            : t('rainAlerts.soon', { minutes: outlook.inMinutes, amount: amount(outlook.mm) })}
      </p>
      <ol className="rain-bars" aria-hidden>
        {slots.map((s) => (
          <li key={s.time}>
            <span className="rain-bar" style={{ height: `${Math.max(2, (s.mm / max) * 100)}%` }} data-wet={s.mm >= RAIN_MM_PER_SLOT} />
            <span className="hint">{s.time.slice(11, 16)}</span>
          </li>
        ))}
      </ol>
      <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.modelNote')}</p>
    </section>
  );
}

/** Dónde avisar si va a llover: mi ubicación y los waypoints marcados. */
function RainAlertsSettings() {
  const { t } = useTranslation();
  const here = useSettings((s) => s.settings.rainAlertsHere);
  const update = useSettings((s) => s.update);
  const waypoints = useWaypoints((s) => s.waypoints);
  const statuses = useRainWatch((s) => s.statuses);
  const watched = [...waypoints.values()].filter((w) => w.rainAlerts);
  const permission = 'Notification' in window ? Notification.permission : 'denied';

  const statusText = (id: string) => {
    const s = statuses.get(id);
    if (!s) return null;
    if (s.outlook.state === 'dry') return t('rainAlerts.statusDry');
    if (s.outlook.state === 'raining') return t('rainAlerts.statusRaining');
    return t('rainAlerts.statusSoon', { minutes: s.outlook.inMinutes });
  };

  return (
    <section className="card stack" aria-labelledby="rain-alerts-title">
      <h2 id="rain-alerts-title" className="section-title" style={{ margin: 0 }}>{t('rainAlerts.title')}</h2>
      <label className="check">
        <input type="checkbox" checked={here} onChange={(e) => void update({ rainAlertsHere: e.target.checked })} />
        {t('rainAlerts.here')}
      </label>
      {here && statusText(HERE_ID) && <p className="hint" style={{ margin: 0 }}>{statusText(HERE_ID)}</p>}
      {watched.length > 0 ? (
        <ul className="list">
          {watched.map((w) => (
            <li key={w.id}>
              <Link className="list-row" to={`/orientation/waypoints/${w.id}`}>
                <span className="list-main">
                  <span className="list-title">{w.name}</span>
                  {statusText(w.id) && <span className="list-sub">{statusText(w.id)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.noWaypoints')}</p>
      )}
      {(here || watched.length > 0) && permission !== 'granted' && <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.enableNotifications')}</p>}
      <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.whileOpen')}</p>
    </section>
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

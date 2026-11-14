import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { compass8, fetchForecast, hasWaves, knots, loadSavedForecast, pointAt, saveForecast, seaState, type WaveForecast } from './waves';

const HOUR = 3_600_000;

/** Gráfico de la altura de las olas de los próximos días, con la línea de «ahora» y los días marcados. */
function WaveChart({ f, now, label, locale }: { f: WaveForecast; now: number; label: string; locale: string }) {
  const W = 600;
  const H = 150;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const pts = f.points.filter((p) => p.waveHeight !== null);
  const t0 = f.points[0]!.time;
  const t1 = f.points[f.points.length - 1]!.time;
  const hi = Math.max(1, Math.ceil(Math.max(...pts.map((p) => p.waveHeight!)) * 2) / 2);
  const x = (ms: number) => pad.l + ((ms - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)} ${y(p.waveHeight!).toFixed(1)}`).join('');
  const area = `${path}L${x(pts[pts.length - 1]!.time).toFixed(1)} ${y(0).toFixed(1)}L${x(pts[0]!.time).toFixed(1)} ${y(0).toFixed(1)}Z`;
  const days: number[] = [];
  const d0 = new Date(t0);
  d0.setHours(24, 0, 0, 0);
  for (let d = d0.getTime(); d <= t1; d += 24 * HOUR) days.push(d);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tide-chart" role="img" aria-label={label} data-testid="wave-chart">
      {[0, hi / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="tide-grid" />
          <text x={pad.l - 4} y={y(v) + 4} textAnchor="end" className="tide-axis">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={area} className="tide-area" />
      <path d={path} className="tide-line" />
      {days.map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={pad.t} y2={H - pad.b} className="tide-day" />
          <text x={x(d) + 4} y={H - 6} className="tide-axis">
            {new Date(d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
          </text>
        </g>
      ))}
      {now >= t0 && now <= t1 && <line x1={x(now)} x2={x(now)} y1={pad.t} y2={H - pad.b} className="tide-now" />}
    </svg>
  );
}

/** Oleaje y viento del lugar elegido (Open-Meteo Marine): es un modelo, no una medición. */
export function WavesCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const weatherUrl = useSettings((s) => s.settings.weatherUrl);
  const [forecast, setForecast] = useState<WaveForecast | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'offline' | 'error'>('idle');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const lat = place?.lat;
  const lon = place?.lon;
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    // Sin conexión: el último pronóstico guardado, si es de un lugar a menos de ~10 km.
    const saved = loadSavedForecast();
    const closeSaved = saved && Math.abs(saved.lat - lat) < 0.1 && Math.abs(saved.lon - lon) < 0.1 ? saved.forecast : null;
    if (!navigator.onLine) {
      setForecast(closeSaved);
      setState('offline');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchForecast(weatherUrl, lat, lon).then(
      (f) => {
        if (cancelled) return;
        setForecast(f);
        if (f && hasWaves(f)) saveForecast(lat, lon, f);
        setState('ok');
      },
      () => {
        if (cancelled) return;
        setForecast(closeSaved);
        setState('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lat?.toFixed(2), lon?.toFixed(2), weatherUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const covered = forecast ? hasWaves(forecast) : false;
  const current = forecast ? pointAt(forecast, now) : null;
  const rows = useMemo(() => (forecast ? forecast.points.filter((p) => p.time >= now - HOUR && new Date(p.time).getHours() % 6 === 0).slice(0, 12) : []), [forecast, Math.floor(now / HOUR)]); // eslint-disable-line react-hooks/exhaustive-deps
  const n1 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n0 = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const dir = (d: number | null) => (d === null ? '' : t(`navigation.waves.compass.${compass8(d)}`));
  const windText = (kmh: number | null, gust: number | null, d: number | null) =>
    kmh === null ? '—' : `${n0.format(kmh)} km/h (${n0.format(knots(kmh))} ${t('navigation.waves.knots')})${gust !== null ? `, ${t('navigation.waves.gusts', { v: n0.format(gust) })}` : ''}${d !== null ? ` · ${t('navigation.waves.from', { dir: dir(d) })}` : ''}`;
  const when = (ms: number) => new Date(ms).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const km = (a: number, b: number) => Math.round(Math.hypot((a - (lat ?? a)) * 111, (b - (lon ?? b)) * 111 * Math.cos(((lat ?? 0) * Math.PI) / 180)));

  return (
    <section className="card stack" aria-labelledby="waves-title" data-testid="waves-card">
      <h2 id="waves-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.waves.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.waves.intro')}
      </p>
      {state === 'loading' && !forecast && <p className="hint">{t('navigation.waves.loading')}</p>}
      {state === 'offline' && (
        <p className="hint" data-testid="waves-offline">
          {forecast ? t('navigation.waves.offlineSaved', { when: when(forecast.fetchedAt) }) : t('navigation.waves.offline')}
        </p>
      )}
      {state === 'error' && !forecast && <p className="error">{t('navigation.waves.error')}</p>}
      {forecast && !covered && (
        <p className="hint" data-testid="waves-none">
          {t('navigation.waves.none')}
        </p>
      )}
      {forecast && covered && current && current.waveHeight !== null && (
        <>
          <p className="decl-value" data-testid="wave-now">
            {n1.format(current.waveHeight)} m
            <span className="hint" style={{ display: 'block', fontSize: '1rem', fontWeight: 400 }}>
              {t(`navigation.waves.state.${seaState(current.waveHeight)}`)}
              {current.wavePeriod !== null ? ` · ${t('navigation.waves.period', { s: n0.format(current.wavePeriod) })}` : ''}
              {current.waveDirection !== null ? ` · ${t('navigation.waves.from', { dir: dir(current.waveDirection) })}` : ''}
            </span>
          </p>
          {current.swellHeight !== null && (
            <p style={{ margin: 0 }} data-testid="wave-swell">
              {t('navigation.waves.swell', { h: n1.format(current.swellHeight), s: current.swellPeriod === null ? '—' : n0.format(current.swellPeriod) })}
            </p>
          )}
          <p style={{ margin: 0 }} data-testid="wave-wind">
            {t('navigation.waves.wind')}: {windText(current.windKmh, current.gustKmh, current.windDirection)}
          </p>
          <WaveChart f={forecast} now={now} label={t('navigation.waves.chartLabel')} locale={i18n.language} />
          <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
            {t('navigation.waves.next')}
          </h3>
          <ul className="list" data-testid="wave-rows">
            {rows.map((p) => (
              <li key={p.time} className="list-row">
                <span className="list-main">
                  <span className="list-title">{when(p.time)}</span>
                  <span className="list-sub">{t('navigation.waves.wind')}: {windText(p.windKmh, p.gustKmh, p.windDirection)}</span>
                </span>
                <span className="list-end">{p.waveHeight === null ? '—' : `${n1.format(p.waveHeight)} m`}</span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.waves.model', { km: km(forecast.lat, forecast.lon) })}
          </p>
        </>
      )}
      <p className="hint" style={{ margin: 0 }} data-testid="waves-source">
        {t('navigation.waves.source')}
      </p>
    </section>
  );
}

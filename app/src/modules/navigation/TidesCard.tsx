import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { isEstuary, loadTides, nearestStations, NEAR_KM, tideCurve, tideExtremes, tideLevelAt, type TidesData } from './tides';

const DAY_MS = 86_400_000;
const DAYS = 3;

/** Gráfico de la marea de los próximos días, con la línea de «ahora» y los días marcados. */
function TideChart({ curve, now, label, locale }: { curve: { time: Date; level: number }[]; now: Date; label: string; locale: string }) {
  const W = 600;
  const H = 170;
  const pad = { l: 38, r: 8, t: 10, b: 22 };
  const t0 = curve[0]!.time.getTime();
  const t1 = curve[curve.length - 1]!.time.getTime();
  const levels = curve.map((p) => p.level);
  const lo = Math.floor(Math.min(...levels) * 2) / 2;
  const hi = Math.ceil(Math.max(...levels) * 2) / 2;
  const x = (ms: number) => pad.l + ((ms - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.time.getTime()).toFixed(1)} ${y(p.level).toFixed(1)}`).join('');
  const area = `${path}L${x(t1).toFixed(1)} ${y(lo).toFixed(1)}L${x(t0).toFixed(1)} ${y(lo).toFixed(1)}Z`;
  const midnights: Date[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getTime() + DAY_MS)) midnights.push(d);
  // Mínimo, máximo y el nivel medio (0) si cae dentro del gráfico.
  const ticks = lo < 0 && hi > 0 ? [lo, 0, hi] : [lo, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tide-chart" role="img" aria-label={label} data-testid="tide-chart">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="tide-grid" />
          <text x={pad.l - 4} y={y(v) + 4} textAnchor="end" className="tide-axis">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={area} className="tide-area" />
      <path d={path} className="tide-line" />
      {midnights.map((d) => (
        <g key={d.getTime()}>
          <line x1={x(d.getTime())} x2={x(d.getTime())} y1={pad.t} y2={H - pad.b} className="tide-day" />
          <text x={x(d.getTime()) + 4} y={H - 6} className="tide-axis">
            {d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
          </text>
        </g>
      ))}
      {now.getTime() >= t0 && now.getTime() <= t1 && <line x1={x(now.getTime())} x2={x(now.getTime())} y1={pad.t} y2={H - pad.b} className="tide-now" />}
    </svg>
  );
}

/** Mareas sin conexión de la estación más cercana al lugar elegido. */
export function TidesCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<TidesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    void loadTides().then(setData, () => setFailed(true));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const near = useMemo(() => (data && place ? nearestStations(data.stations, place.lat, place.lon, 3) : []), [data, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setChosen(0), [place?.lat, place?.lon]);
  const pick = near[chosen] ?? near[0];
  const station = pick?.station;

  // Desde hoy a las 00:00 (hora del teléfono) durante tres días.
  const start = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now.getDate()]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useMemo(() => new Date(start.getTime() + DAYS * DAY_MS), [start]);
  const curve = useMemo(() => (station ? tideCurve(station, start, end) : []), [station, start, end]);
  const extremes = useMemo(() => (station ? tideExtremes(station, new Date(now.getTime() - 3 * 3_600_000), end).filter((e) => e.time.getTime() >= now.getTime() - 3_600_000) : []), [station, now.getHours(), end]); // eslint-disable-line react-hooks/exhaustive-deps
  const levelNow = station ? tideLevelAt(station, now) : null;
  const levelSoon = station ? tideLevelAt(station, new Date(now.getTime() + 10 * 60_000)) : null;
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const when = (d: Date) => d.toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="card stack" aria-labelledby="tides-title" data-testid="tides-card">
      <h2 id="tides-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.tides.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.tides.intro')}
      </p>
      {failed && <p className="error">{t('navigation.tides.unavailable')}</p>}
      {data && place && station && pick && (
        <>
          {near.length > 1 && (
            <div className="chips" role="group" aria-label={t('navigation.tides.stations')} data-testid="tide-stations">
              {near.map((n, i) => (
                <button key={n.station.id} type="button" className="chip" aria-pressed={i === chosen} onClick={() => setChosen(i)}>
                  {n.station.name} · {km.format(n.km)} km
                </button>
              ))}
            </div>
          )}
          <p style={{ margin: 0 }} data-testid="tide-station">
            <strong>{station.name}</strong> ({t(`country.${station.country}`)}) · {t('navigation.tides.distance', { km: km.format(pick.km) })}
          </p>
          {pick.km > NEAR_KM && (
            <p className="error" role="alert" data-testid="tide-far">
              {t('navigation.tides.far', { km: km.format(pick.km) })}
            </p>
          )}
          {isEstuary(station, place.lat, place.lon) && (
            <p className="rain-notice" role="alert" data-testid="tide-estuary" style={{ margin: 0 }}>
              <span className="update-text">
                <strong>{t('navigation.tides.estuaryTitle')}</strong>
                <span className="hint">{t('navigation.tides.estuary')}</span>
              </span>
            </p>
          )}
          {station.issues.length > 0 && (
            <p className="hint" data-testid="tide-issues" style={{ margin: 0 }}>
              {t('navigation.tides.issues')}
            </p>
          )}
          {levelNow !== null && levelSoon !== null && (
            <p className="decl-value" data-testid="tide-now">
              {t('navigation.tides.now', { level: nf.format(levelNow), trend: t(levelSoon >= levelNow ? 'navigation.tides.rising' : 'navigation.tides.falling') })}
            </p>
          )}
          {curve.length > 1 && <TideChart curve={curve} now={now} label={t('navigation.tides.chartLabel', { days: DAYS })} locale={i18n.language} />}
          <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
            {t('navigation.tides.next')}
          </h3>
          <ul className="list" data-testid="tide-extremes">
            {extremes.map((e) => (
              <li key={e.time.getTime()} className="list-row">
                <span className="list-main">
                  <span className="list-title">{t(e.high ? 'navigation.tides.high' : 'navigation.tides.low')}</span>
                  <span className="list-sub">{when(e.time)}</span>
                </span>
                <span className="list-end">{nf.format(e.level)} m</span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.tides.reference')}
          </p>
          <p className="hint" style={{ margin: 0 }} data-testid="tide-source">
            {t('navigation.tides.source', { source: data.source, date: data.generatedAt })}
          </p>
        </>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { today } from '@/modules/inventory/domain/dates';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { MoonIcon } from './MoonIcon';
import { moonDay, startOfLocalDay, sunDay } from './sky';

const DAY_MS = 86_400_000;

function dayFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function AstronomyPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const [day, setDay] = useState(today());
  const dayStart = useMemo(() => startOfLocalDay(dayFromIso(day)), [day]);

  // Redondeo a ~1 km: el GPS cambia en metros y recalcular no aporta nada.
  const lat = place ? Math.round(place.lat * 100) / 100 : null;
  const lon = place ? Math.round(place.lon * 100) / 100 : null;
  const alt = place?.alt ?? null;
  const sky = useMemo(
    () => (lat === null || lon === null ? null : { sun: sunDay({ lat, lon, alt }, dayStart), moon: moonDay({ lat, lon, alt }, dayStart) }),
    [lat, lon, alt, dayStart],
  );

  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const fmt = (d: Date | null) => (d ? time.format(d) : '—');
  const dateLabel = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(dayStart);
  const shortDate = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const shift = (days: number) => setDay(today(new Date(dayStart.getTime() + days * DAY_MS + DAY_MS / 2)));
  const hours = (ms: number) => t('sky.duration', { h: Math.floor(ms / 3_600_000), m: Math.round((ms % 3_600_000) / 60_000) });

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.astronomy.title')}</h1>
      {picker}

      <div className="day-nav">
        <button className="icon-btn" type="button" onClick={() => shift(-1)} aria-label={t('sky.previousDay')}>
          <ChevronLeft size={22} />
        </button>
        <label className="day-nav-label">
          <span className="sr-only">{t('sky.date')}</span>
          <input className="input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <span className="hint" data-testid="sky-date">{dateLabel}</span>
        </label>
        <button className="icon-btn" type="button" onClick={() => shift(1)} aria-label={t('sky.nextDay')}>
          <ChevronRight size={22} />
        </button>
      </div>

      {!sky ? (
        <p className="empty">{t('sky.needPlace')}</p>
      ) : (
        <>
          <section className="card stack" aria-labelledby="sun-title">
            <h2 id="sun-title" className="section-title" style={{ margin: 0 }}>
              <Sun size={18} aria-hidden /> {t('sky.sun')}
            </h2>
            {sky.sun.polar ? (
              <p className="sky-big">{t(`sky.polar.${sky.sun.polar}`)}</p>
            ) : (
              <div className="nav-readout">
                <div>
                  <span className="nav-label"><Sunrise size={16} aria-hidden /> {t('sky.sunrise')}</span>
                  <span className="nav-value" data-testid="sunrise">{fmt(sky.sun.sunrise)}</span>
                </div>
                <div>
                  <span className="nav-label"><Sunset size={16} aria-hidden /> {t('sky.sunset')}</span>
                  <span className="nav-value" data-testid="sunset">{fmt(sky.sun.sunset)}</span>
                </div>
              </div>
            )}
            <p className="hint" style={{ margin: 0 }}>
              {t('sky.daylight', { duration: hours(sky.sun.daylightMs) })} · {t('sky.solarNoon', { time: fmt(sky.sun.solarNoon) })}
            </p>
            <table className="sky-table">
              <thead>
                <tr>
                  <th scope="col">{t('sky.twilight')}</th>
                  <th scope="col">{t('sky.dawn')}</th>
                  <th scope="col">{t('sky.dusk')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t('sky.civil')}</th>
                  <td>{fmt(sky.sun.civilDawn)}</td>
                  <td>{fmt(sky.sun.civilDusk)}</td>
                </tr>
                <tr>
                  <th scope="row">{t('sky.nautical')}</th>
                  <td>{fmt(sky.sun.nauticalDawn)}</td>
                  <td>{fmt(sky.sun.nauticalDusk)}</td>
                </tr>
                <tr>
                  <th scope="row">{t('sky.astronomical')}</th>
                  <td>{fmt(sky.sun.astronomicalDawn)}</td>
                  <td>{fmt(sky.sun.astronomicalDusk)}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ margin: 0 }}>{t('sky.twilightHint')}</p>
          </section>

          <section className="card stack" aria-labelledby="moon-title">
            <h2 id="moon-title" className="section-title" style={{ margin: 0 }}>
              <Moon size={18} aria-hidden /> {t('sky.moon')}
            </h2>
            <div className="moon-row">
              <MoonIcon phaseAngle={sky.moon.phaseAngle} southern={(lat ?? 0) < 0} />
              <div>
                <p className="sky-big" data-testid="moon-phase">{t(`sky.phases.${sky.moon.phase}`)}</p>
                <p className="hint" style={{ margin: 0 }}>{t('sky.illumination', { pct: Math.round(sky.moon.illumination * 100) })}</p>
                <p className="hint" style={{ margin: 0 }}>
                  {t('sky.moonrise', { time: fmt(sky.moon.moonrise) })} · {t('sky.moonset', { time: fmt(sky.moon.moonset) })}
                </p>
              </div>
            </div>
            <ul className="list">
              {sky.moon.nextQuarters.map((q) => (
                <li key={q.phase} className="list-row">
                  <MoonIcon phaseAngle={{ new: 0, firstQuarter: 90, full: 180, lastQuarter: 270 }[q.phase]} southern={(lat ?? 0) < 0} size={28} />
                  <span className="list-main">
                    <span className="list-title">{t(`sky.phases.${q.phase}`)}</span>
                  </span>
                  <span className="list-sub">{shortDate.format(q.date)}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="hint">{t('sky.timesNote', { place: place!.label })}</p>
        </>
      )}
    </div>
  );
}

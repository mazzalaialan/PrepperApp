import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { missingInZone, monthPlan, zoneCalendar } from './calendar';
import { cropName } from './crops';
import { CropLink, GardenSources, MONTHS_SHORT, MonthStrip, StripLegend, ZonePicker } from './parts';
import { useZonePlace, useGardenZone } from './status';

/** Calendario de siembra por zona (ARQUITECTURA §10.1): qué hacer este mes y la línea de 12 meses. */
export function GardenCalendarPage() {
  const { t, i18n } = useTranslation();
  const place = useZonePlace(false);
  const { zone, suggested, manual } = useGardenZone(place);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const plan = useMemo(() => monthPlan(zone, month), [zone, month]);
  const all = useMemo(() => zoneCalendar(zone).sort((a, b) => cropName(a.crop, i18n.language).localeCompare(cropName(b.crop, i18n.language))), [zone, i18n.language]);
  const missing = useMemo(() => missingInZone(zone), [zone]);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month - 1, 15)));
  const now = new Date().getMonth() + 1;
  const names = MONTHS_SHORT(i18n.language);

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.gardenCalendar.title')}</h1>
      <section className="card stack">
        <ZonePicker place={place} zone={zone} suggested={suggested} manual={manual} />
      </section>

      <section className="card stack" aria-labelledby="garden-month">
        <div className="day-nav">
          <button className="icon-btn" type="button" onClick={() => setMonth(((month + 10) % 12) + 1)} aria-label={t('garden.prevMonth')}>
            <ChevronLeft size={22} />
          </button>
          <h2 id="garden-month" className="day-nav-label" style={{ flex: 1, textAlign: 'center', margin: 0 }}>
            {month === now ? t('garden.thisMonth', { month: monthName }) : monthName}
          </h2>
          <button className="icon-btn" type="button" onClick={() => setMonth((month % 12) + 1)} aria-label={t('garden.nextMonth')}>
            <ChevronRight size={22} />
          </button>
        </div>
        {(['sow', 'nursery', 'transplant', 'harvest'] as const).map((k) => (
          <div key={k} className="stack" style={{ gap: 6 }} data-testid={`plan-${k}`}>
            <h3 className="garden-plan-title">
              <span className={`garden-bar garden-bar-${k} on`} /> {t(`garden.plan.${k}`)}
            </h3>
            {plan[k].length ? (
              <div className="chips">
                {plan[k].map((c) => (
                  <CropLink key={c.crop.id} crop={c.crop} />
                ))}
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>{t('garden.plan.none')}</p>
            )}
          </div>
        ))}
        {plan.transplant.some((c) => c.cover) || plan.nursery.some((c) => c.cover) ? <p className="hint" style={{ margin: 0 }}>{t('garden.coverNote')}</p> : null}
      </section>

      <section className="card stack" aria-labelledby="garden-year">
        <h2 id="garden-year" className="section-title" style={{ margin: 0 }}>{t('garden.year')}</h2>
        <StripLegend />
        <div className="garden-year">
          <div className="garden-year-row garden-year-head">
            <span />
            <div className="garden-strip">
              {names.map((n, i) => (
                <span key={n} className={`garden-month-name${i + 1 === now ? ' garden-month-now' : ''}`}>
                  {n.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          {all.map((c) => (
            <Link key={c.crop.id} to={`/garden/crops/${c.crop.id}`} className="garden-year-row">
              <span className="garden-year-name">
                {cropName(c.crop, i18n.language)}
                {c.cover && ' *'}
              </span>
              <MonthStrip cal={c} month={now} />
            </Link>
          ))}
        </div>
        {all.some((c) => c.cover) && <p className="hint" style={{ margin: 0 }}>* {t('garden.coverNote')}</p>}
        {missing.length > 0 && (
          <p className="hint" style={{ margin: 0 }}>
            {t('garden.missing', { list: missing.map((c) => cropName(c, i18n.language)).join(', ') })}
          </p>
        )}
      </section>
      <GardenSources />
    </div>
  );
}

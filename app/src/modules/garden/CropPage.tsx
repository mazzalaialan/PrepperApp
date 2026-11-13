import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { cropCalendar } from './calendar';
import { CROP_BY_ID, cropName, gridFootprint, text } from './crops';
import { CropLink, FAMILY_COLOR, GardenSources, MonthStrip, StripLegend } from './parts';
import { useZonePlace, useGardenZone } from './status';
import { SeedSection } from './SeedSection';

/** Ficha de un cultivo, con su calendario en la zona. */
export function CropPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const place = useZonePlace(false);
  const { zone } = useGardenZone(place);
  const crop = CROP_BY_ID.get(id);
  if (!crop) return <Navigate to="/garden/calendar" replace />;
  const cal = cropCalendar(zone, crop.id);
  const fp = gridFootprint(crop);
  const days = (d: [number, number]) => t('garden.daysRange', { from: d[0], to: d[1] });
  // En semanas y con la fecha estimada si se siembra (o se trasplanta) hoy: no hay que sumar a mano.
  const dateAfter = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString(lang, { day: 'numeric', month: 'long' });
  const weeks = (d: [number, number]) => t('garden.weeksRange', { from: Math.round(d[0] / 7), to: Math.round(d[1] / 7) });
  const others = (ids: string[]) => ids.map((x) => CROP_BY_ID.get(x)).filter((c) => !!c);

  return (
    <div className="stack">
      <h1 className="page-title">
        <span className="garden-dot" style={{ background: FAMILY_COLOR[crop.family] }} aria-hidden /> {cropName(crop, lang)}
      </h1>

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('garden.inZone', { zone: t(`garden.zones.${zone}`) })}</h2>
        {cal ? (
          <>
            <StripLegend />
            <MonthStrip cal={cal} month={new Date().getMonth() + 1} labels />
            {cal.cover && <p className="hint" style={{ margin: 0 }}>{t('garden.coverNote')}</p>}
          </>
        ) : (
          <p className="hint" style={{ margin: 0 }}>{t('garden.notInZone')}</p>
        )}
      </section>

      <section className="card">
        <dl className="garden-facts">
          <dt>{t('garden.facts.family')}</dt>
          <dd>{t(`garden.families.${crop.family}`)}</dd>
          <dt>{t('garden.facts.sowing')}</dt>
          <dd>{t(`garden.sowing.${crop.sowing}`)}</dd>
          {crop.nurseryDays && (
            <>
              <dt>{t('garden.facts.nursery')}</dt>
              <dd>{days(crop.nurseryDays)}</dd>
            </>
          )}
          <dt>{t('garden.facts.toHarvest')}</dt>
          <dd>
            {crop.firstHarvestYear ? (
              t('garden.fromYear', { year: crop.firstHarvestYear })
            ) : (
              <>
                {days(crop.daysToHarvest)} ({weeks(crop.daysToHarvest)})
                <br />
                <span className="hint" data-testid="harvest-estimate">
                  {crop.sowing === 'transplant'
                    ? t('garden.harvestIfTransplant', { from: dateAfter(crop.daysToHarvest[0]), to: dateAfter(crop.daysToHarvest[1]) })
                    : t('garden.harvestIfSow', { from: dateAfter(crop.daysToHarvest[0]), to: dateAfter(crop.daysToHarvest[1]) })}
                </span>
              </>
            )}
          </dd>
          <dt>{t('garden.facts.spacing')}</dt>
          <dd>{t('garden.spacingValue', { plant: crop.spacingCm, row: crop.rowCm })}</dd>
          <dt>{t('garden.facts.grid')}</dt>
          <dd>{fp.side > 1 ? t('garden.gridCells', { side: fp.side, cells: fp.side * fp.side }) : t('garden.gridPerCell', { count: fp.perCell })}</dd>
          <dt>{t('garden.facts.frost')}</dt>
          <dd>{t(`garden.frost.${crop.frost}`)}</dd>
          <dt>{t('garden.facts.sun')}</dt>
          <dd>{crop.shade ? t('garden.sunShade') : t('garden.sunFull')}</dd>
          <dt>{t('garden.facts.container')}</dt>
          <dd>{crop.container ? t('garden.yes') : t('garden.no')}</dd>
          <dt>{t('garden.facts.water')}</dt>
          <dd>{text(crop.waterCritical, lang)}</dd>
          <dt>{t('garden.facts.yield')}</dt>
          <dd>{text(crop.yield, lang)}</dd>
          <dt>{t('garden.facts.harvest')}</dt>
          <dd>{text(crop.harvest, lang)}</dd>
          {crop.rotateAfter.length > 0 && (
            <>
              <dt>{t('garden.facts.rotation')}</dt>
              <dd>{crop.rotateAfter.map((g) => t(`garden.groups.${g}`)).join(', ')}</dd>
            </>
          )}
        </dl>
      </section>

      <SeedSection cropId={crop.id} />

      {(crop.companions.length > 0 || crop.companionHerbs) && (
        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('garden.companions')}</h2>
          <div className="chips">
            {others(crop.companions).map((c) => (
              <CropLink key={c.id} crop={c} />
            ))}
          </div>
          {crop.companionHerbs && <p className="hint" style={{ margin: 0 }}>{t('garden.herbs', { list: text(crop.companionHerbs, lang) })}</p>}
        </section>
      )}
      {crop.avoid.length > 0 && (
        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('garden.avoid')}</h2>
          <div className="chips">
            {others(crop.avoid).map((c) => (
              <CropLink key={c.id} crop={c} />
            ))}
          </div>
        </section>
      )}
      <GardenSources />
    </div>
  );
}

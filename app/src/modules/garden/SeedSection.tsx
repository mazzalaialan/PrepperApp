import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadSeeds, seedText, type SeedInfo } from './seeds';

const LEVEL_PILL: Record<SeedInfo['level'], string> = { easy: 'pill pill-free', medium: 'pill pill-warn', hard: 'pill pill-danger', no: 'pill' };

/** «Guardar semilla propia» de la ficha de un cultivo: dificultad, aislamiento, plantas, cosecha y secado, vida de la semilla y fuentes. */
export function SeedSection({ cropId }: { cropId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [info, setInfo] = useState<SeedInfo | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadSeeds()
      .then((all) => live && setInfo(all[cropId] ?? null))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [cropId]);
  if (!info) return null;

  const { isolationM: iso, minPlants: pl, yearsViable: yr } = info;
  // Números con el formato del idioma (0,5 y 1.000 en español).
  const f = (n: number | null) => (n === null ? '' : n.toLocaleString(lang));
  const isolation =
    iso.min === null && iso.rec === null
      ? t('garden.seeds.notApplicable')
      : iso.min !== null && iso.rec !== null && iso.min !== iso.rec
        ? t('garden.seeds.isolationBoth', { min: f(iso.min), rec: f(iso.rec) })
        : t('garden.seeds.isolationOne', { m: f(iso.rec ?? iso.min) });
  const plants =
    pl.min === null && pl.rec === null
      ? t('garden.seeds.notApplicable')
      : pl.min !== null && pl.rec !== null && pl.min !== pl.rec
        ? t('garden.seeds.plantsBoth', { min: f(pl.min), rec: f(pl.rec) })
        : t('garden.seeds.plantsOne', { n: f(pl.rec ?? pl.min) });
  const years =
    yr.min === null && yr.max === null
      ? t('garden.seeds.unknown')
      : yr.min !== null && yr.max !== null && yr.min !== yr.max
        ? t('garden.seeds.yearsRange', { min: f(yr.min), max: f(yr.max) })
        : yr.max === null
          ? t('garden.seeds.yearsPlus', { n: f(yr.min) })
          : (yr.max ?? yr.min) === 1
            ? t('garden.seeds.yearOne')
            : t('garden.seeds.yearsOne', { n: f(yr.max ?? yr.min) });

  return (
    <section className="card stack" data-testid="seed-section" data-level={info.level}>
      <h2 className="section-title" style={{ margin: 0 }}>{t('garden.seeds.title')}</h2>
      <p style={{ margin: 0 }}>
        <span className={LEVEL_PILL[info.level]} data-testid="seed-level">{t(`garden.seeds.level.${info.level}`)}</span>{' '}
        {seedText(info.why, lang)}
      </p>
      <dl className="garden-facts">
        <dt>{t('garden.seeds.cycle')}</dt>
        <dd>
          {t(`garden.seeds.cycleOf.${info.cycle}`)}
          <br />
          <span className="hint">{seedText(info.cycleNote, lang)}</span>
        </dd>
        <dt>{t('garden.seeds.pollination')}</dt>
        <dd>{t(`garden.seeds.pollinationOf.${info.pollination}`)}</dd>
        <dt>{t('garden.seeds.isolation')}</dt>
        <dd data-testid="seed-isolation">
          {isolation}
          {info.isolationNote && (
            <>
              <br />
              <span className="hint">{seedText(info.isolationNote, lang)}</span>
            </>
          )}
        </dd>
        <dt>{t('garden.seeds.plants')}</dt>
        <dd>{plants}</dd>
        <dt>{t('garden.seeds.years')}</dt>
        <dd>{years}</dd>
      </dl>
      {info.caveat && <p className="warning-box" style={{ margin: 0 }} data-testid="seed-caveat">{seedText(info.caveat, lang)}</p>}
      <details>
        <summary>{t('garden.seeds.howTo')}</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <p style={{ margin: 0 }}><strong>{t('garden.seeds.whenHarvest')}:</strong> {seedText(info.harvest, lang)}</p>
          <p style={{ margin: 0 }}><strong>{t('garden.seeds.dryStore')}:</strong> {seedText(info.dry, lang)}</p>
          <p style={{ margin: 0 }}><strong>{t('garden.seeds.hybrids')}:</strong> {seedText(info.hybrids, lang)}</p>
          {info.argentina && <p style={{ margin: 0 }}><strong>{t('garden.seeds.argentina')}:</strong> {seedText(info.argentina, lang)}</p>}
        </div>
      </details>
      <p className="hint" style={{ margin: 0 }}>{t(`garden.seeds.confidence.${info.confidence}`)} {t('garden.seeds.disclaimer')}</p>
      <details>
        <summary>{t('garden.seeds.sources')}</summary>
        <ul className="stack" style={{ marginTop: 8, paddingLeft: 18 }}>
          {info.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">{s.name}</a> <span className="hint">({s.license})</span>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ margin: 0 }}>{t('garden.seeds.sourcesNote')}</p>
      </details>
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import { GLOSSARY, ROPES } from './content';
import { tl } from './KnotGuidePage';

/** Cuerdas: tipos, resistencia y cuidado. */
export function RopesPage() {
  const { t, i18n } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.ropes.title')}</h1>
      {ROPES.map((s) => (
        <section key={s.title.es} className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{tl(s.title, i18n.language)}</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }} className="stack">
            {s.items.map((it) => (
              <li key={it.es}>{tl(it, i18n.language)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Glosario: las palabras que usan los pasos de los nudos. */
export function GlossaryPage() {
  const { t, i18n } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.knotGlossary.title')}</h1>
      <dl className="card knot-glossary" data-testid="knot-glossary">
        {GLOSSARY.map((g) => (
          <div key={g.term.es}>
            <dt>{tl(g.term, i18n.language)}</dt>
            <dd>{tl(g.def, i18n.language)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

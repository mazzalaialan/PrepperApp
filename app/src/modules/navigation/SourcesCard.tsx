import { useTranslation } from 'react-i18next';
import { visibleSources } from './sources';

/** Las fuentes de Navegación con su licencia y la cita que corresponde. */
export function SourcesCard() {
  const { t } = useTranslation();
  return (
    <section className="card stack" aria-labelledby="sources-title" data-testid="sources-card">
      <h2 id="sources-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.sources.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.sources.intro')}
      </p>
      <ul className="list">
        {visibleSources().map((s) => (
          <li key={s.id} className="list-row" data-testid={`source-${s.id}`}>
            <span className="list-main">
              <span className="list-title">
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
              </span>
              <span className="list-sub">{s.provides}</span>
              <span className="list-sub">
                {t('navigation.sources.license')}: {s.licenseText}
              </span>
              <span className="list-sub">{s.cite}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

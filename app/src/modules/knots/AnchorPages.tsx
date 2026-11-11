import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ANCHOR_BY_ID, ANCHOR_KINDS, ANCHOR_SOURCES, ANCHORS, type Anchor } from './anchors';
import { KNOT_BY_ID, RISKY_USES } from './knots';
import { tl } from './KnotGuidePage';
import { norm } from './search';
import { Notice } from '@/ui/Notice';

const src = (file: string) => `${import.meta.env.BASE_URL}anchors/${file}`;

/** Anclajes: principios, puntos naturales, cómo sujetar, armados e improvisados (ARQUITECTURA §10.2). */
export function AnchorsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const words = norm(query).split(' ').filter(Boolean);
    return ANCHORS.filter((a) => {
      const hay = norm([a.name.es, a.name.en, ...a.aliases, a.summary.es, a.summary.en].join(' '));
      return words.every((w) => hay.includes(w));
    });
  }, [query]);
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.anchors.title')}</h1>
      <Notice id="anchors.safety" variant="warning">{t('anchors.safety')}</Notice>
      <div className="field">
        <label htmlFor="anchor-search">{t('anchors.search')}</label>
        <div className="input-group">
          <Search size={18} aria-hidden style={{ alignSelf: 'center' }} />
          <input id="anchor-search" className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('anchors.searchHint')} />
        </div>
      </div>
      {ANCHOR_KINDS.map((kind) => {
        const list = shown.filter((a) => a.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="card stack" data-testid={`anchors-${kind}`}>
            <h2 className="section-title" style={{ margin: 0 }}>{t(`anchors.kinds.${kind}`)}</h2>
            <ul className="list">
              {list.map((a) => (
                <li key={a.id}>
                  <Link className="list-row knot-row" to={`/knots/anchors/${a.id}`}>
                    {a.images[0] ? <img className="knot-thumb" src={src(a.images[0])} alt="" loading="lazy" /> : <span className="knot-thumb" />}
                    <span className="list-main">
                      <span className="list-title">{tl(a.name, lang)}</span>
                      <span className="list-sub">{tl(a.summary, lang)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {shown.length === 0 && <p className="hint">{t('knots.noResults')}</p>}
      <p className="hint" style={{ margin: 0 }}>{tl(ANCHOR_SOURCES, lang)}</p>
    </div>
  );
}

function AnchorTable({ table, lang }: { table: NonNullable<Anchor['table']>; lang: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <table className="anchor-table">
        <thead>
          <tr>
            <th>{tl(table.head[0], lang)}</th>
            <th>{tl(table.head[1], lang)}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.note && <p className="hint" style={{ margin: 0 }}>{tl(table.note, lang)}</p>}
    </div>
  );
}

export function AnchorPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const a = ANCHOR_BY_ID.get(id);
  if (!a) return <Navigate to="/knots/anchors" replace />;
  return (
    <div className="stack">
      <h1 className="page-title" style={{ margin: 0 }}>{tl(a.name, lang)}</h1>
      <p className="hint" style={{ margin: 0 }}>{t(`anchors.kinds.${a.kind}`)}</p>
      {a.uses.some((u) => RISKY_USES.has(u)) && (
        <Notice id="anchors.safety" variant="warning" testId="anchor-safety">
          {t('anchors.safety')}
        </Notice>
      )}
      <p style={{ margin: 0 }}>{tl(a.summary, lang)}</p>
      {a.images.length > 0 && (
        <div className="knot-gallery">
          {a.images.map((f) => (
            <img key={f} src={src(f)} alt={tl(a.name, lang)} loading="lazy" />
          ))}
        </div>
      )}
      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('anchors.how')}</h2>
        <ol className="knot-steps" data-testid="anchor-steps">
          {a.steps.map((s) => (
            <li key={s.es}>
              <p style={{ margin: 0 }}>{tl(s, lang)}</p>
            </li>
          ))}
        </ol>
        {a.table && <AnchorTable table={a.table} lang={lang} />}
      </section>
      <section className="card stack">
        <h3 className="garden-plan-title">{t('knots.check')}</h3>
        <p style={{ margin: 0 }}>{tl(a.check, lang)}</p>
        {a.mistakes.length > 0 && (
          <>
            <h3 className="garden-plan-title">{t('knots.mistakes')}</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {a.mistakes.map((m) => (
                <li key={m.es}>{tl(m, lang)}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      {a.knots.length > 0 && (
        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('anchors.knots')}</h2>
          <div className="chips">
            {a.knots.map((k) => {
              const knot = KNOT_BY_ID.get(k);
              return knot ? (
                <Link key={k} className="chip" to={`/knots/guide/${k}`}>
                  {tl(knot.name, lang)}
                </Link>
              ) : null;
            })}
          </div>
        </section>
      )}
      <p className="hint" style={{ margin: 0 }}>{tl(ANCHOR_SOURCES, lang)}</p>
    </div>
  );
}

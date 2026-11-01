import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, FileText, Plus, Search } from 'lucide-react';
import type { Attachment, PersonalDocument } from '@/core/model/types';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { daysBetween, today } from '@/modules/inventory/domain/dates';
import { normalize } from '@/modules/inventory/selectors';
import { useBlobUrl } from '@/ui/useBlobUrl';
import { DocumentExpiryBadge } from './DocumentExpiryList';
import { DOCUMENT_LEAD_DAYS } from './expiry';
import { groupDocuments, ownerLabel, type DocumentGroup } from './owners';
import { documentPages, useDocuments } from './store';

function Thumb({ page }: { page: Attachment | undefined }) {
  const url = useBlobUrl(page?.id, page?.mime);
  return url ? (
    <img className="doc-thumb" src={url} alt="" />
  ) : (
    <span className="doc-thumb doc-thumb-empty">
      <FileText size={22} aria-hidden />
    </span>
  );
}

export function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const documents = useDocuments((s) => s.documents);
  const reorderDocuments = useDocuments((s) => s.reorderDocuments);
  const profiles = useMedical((s) => s.profiles);
  const [query, setQuery] = useState('');
  const [onlyMedical, setOnlyMedical] = useState(false);
  const [sorting, setSorting] = useState(false);

  // Al ordenar se ven todos: mover dentro de una lista filtrada confunde.
  const groups = useMemo(() => {
    const q = sorting ? '' : normalize(query.trim());
    const visible = [...documents.values()]
      .filter((d) => sorting || !onlyMedical || d.category === 'medical')
      .filter((d) => {
        if (!q) return true;
        const owner = d.profileId ? profiles.get(d.profileId) : undefined;
        // La búsqueda también encuentra por persona ("Juan") o por "médico".
        const text = [d.title, ...d.tags, owner ? ownerLabel(owner, t) : '', d.category === 'medical' ? t('documents.categories.medical') : ''];
        return normalize(text.join(' ')).includes(q);
      });
    return groupDocuments(visible, profiles, i18n.language);
  }, [documents, profiles, query, onlyMedical, sorting, i18n.language, t]);
  const hasMedical = useMemo(() => [...documents.values()].some((d) => d.category === 'medical'), [documents]);
  const general = groups.find((g) => !g.profile);
  const family = groups.filter((g) => g.profile);

  async function move(group: DocumentGroup, index: number, delta: -1 | 1) {
    const ids = group.docs.map((d) => d.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await reorderDocuments(ids);
  }

  const list = (group: DocumentGroup) => (
    <ul className="list" data-testid={`doc-group-${group.profile?.id ?? 'general'}`}>
      {group.docs.map((doc, i) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          sorting={sorting}
          first={i === 0}
          last={i === group.docs.length - 1}
          onMove={(delta) => void move(group, i, delta)}
        />
      ))}
    </ul>
  );

  return (
    <>
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.documents.title')}</h1>
        {documents.size > 1 && (
          <button className="btn" type="button" aria-pressed={sorting} onClick={() => setSorting((s) => !s)}>
            {sorting ? <Check size={18} /> : <ArrowUpDown size={18} />} {sorting ? t('documents.sortDone') : t('documents.sort')}
          </button>
        )}
        {!sorting && (
          <Link className="btn btn-primary" to="/documents/new">
            <Plus size={20} /> {t('documents.new')}
          </Link>
        )}
      </div>

      {documents.size > 0 && !sorting && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="search">
            <Search size={18} aria-hidden />
            <input className="input" type="search" placeholder={t('documents.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {hasMedical && (
            <div className="chips">
              <button type="button" className="chip" aria-pressed={onlyMedical} onClick={() => setOnlyMedical((v) => !v)}>
                {t('documents.onlyMedical')}
              </button>
            </div>
          )}
        </div>
      )}
      {sorting && <p className="hint">{t('documents.sortHint')}</p>}

      {groups.length === 0 ? (
        <p className="empty">{documents.size === 0 ? t('documents.empty') : t('documents.noResults')}</p>
      ) : (
        <>
          {general && (
            <section className="doc-group" aria-labelledby="docs-general">
              <h2 id="docs-general" className="section-title">{t('documents.groupGeneral')}</h2>
              {list(general)}
            </section>
          )}
          {family.length > 0 && (
            <section className="doc-group" aria-labelledby="docs-family">
              <h2 id="docs-family" className="section-title">{t('documents.groupFamily')}</h2>
              {family.map((g) => (
                <div key={g.profile!.id} className="doc-subgroup">
                  <h3 className="doc-subgroup-title">{ownerLabel(g.profile!, t)}</h3>
                  {list(g)}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

function DocumentRow({
  doc,
  sorting,
  first,
  last,
  onMove,
}: {
  doc: PersonalDocument;
  sorting: boolean;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t, i18n } = useTranslation();
  const allPages = useDocuments((s) => s.pages);
  const pages = useMemo(() => documentPages(allPages, doc.id), [allPages, doc.id]);
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const daysLeft = doc.expiryDate ? daysBetween(today(), doc.expiryDate) : null;
  const content = (
    <>
      <Thumb page={pages[0]} />
      <span className="list-main">
        <span className="list-title">{doc.title}</span>
        <span className="list-sub">
          {[
            doc.category === 'medical' && t('documents.categories.medical'),
            t('documents.photoCount', { count: pages.length }),
            doc.expiryDate && t('documents.expiresOn', { date: dateFmt.format(new Date(`${doc.expiryDate}T00:00:00Z`)) }),
            doc.tags.length > 0 && doc.tags.join(', '),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {daysLeft !== null && daysLeft <= DOCUMENT_LEAD_DAYS && <DocumentExpiryBadge daysLeft={daysLeft} />}
    </>
  );
  if (!sorting) {
    return (
      <li>
        <Link className="list-row" to={`/documents/${doc.id}`}>
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li className="list-row doc-sorting">
      {content}
      <span className="doc-move">
        <button className="icon-btn" type="button" disabled={first} onClick={() => onMove(-1)} aria-label={t('documents.moveUp', { name: doc.title })}>
          <ArrowUp size={18} />
        </button>
        <button className="icon-btn" type="button" disabled={last} onClick={() => onMove(1)} aria-label={t('documents.moveDown', { name: doc.title })}>
          <ArrowDown size={18} />
        </button>
      </span>
    </li>
  );
}

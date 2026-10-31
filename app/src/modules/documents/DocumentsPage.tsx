import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import type { Attachment } from '@/core/model/types';
import { normalize } from '@/modules/inventory/selectors';
import { useBlobUrl } from '@/ui/useBlobUrl';
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
  const pages = useDocuments((s) => s.pages);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    return [...documents.values()]
      .filter((d) => !q || normalize([d.title, ...d.tags].join(' ')).includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, i18n.language))
      .map((doc) => ({ doc, pages: documentPages(pages, doc.id) }));
  }, [documents, pages, query, i18n.language]);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.documents.title')}</h1>
        <Link className="btn btn-primary" to="/inventory/documents/new">
          <Plus size={20} /> {t('documents.new')}
        </Link>
      </div>

      {documents.size > 0 && (
        <div className="toolbar">
          <label className="search">
            <Search size={18} aria-hidden />
            <input className="input" type="search" placeholder={t('documents.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty">{documents.size === 0 ? t('documents.empty') : t('documents.noResults')}</p>
      ) : (
        <ul className="list">
          {rows.map(({ doc, pages }) => (
            <li key={doc.id}>
              <Link className="list-row" to={`/inventory/documents/${doc.id}`}>
                <Thumb page={pages[0]} />
                <span className="list-main">
                  <span className="list-title">{doc.title}</span>
                  <span className="list-sub">
                    {t('documents.photoCount', { count: pages.length })}
                    {doc.tags.length > 0 && ` · ${doc.tags.join(', ')}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

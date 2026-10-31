import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileText, Plus, Search } from 'lucide-react';
import type { Attachment } from '@/core/model/types';
import { daysBetween, today } from '@/modules/inventory/domain/dates';
import { normalize } from '@/modules/inventory/selectors';
import { useBlobUrl } from '@/ui/useBlobUrl';
import { DocumentExpiryBadge } from './DocumentExpiryList';
import { DOCUMENT_LEAD_DAYS } from './expiry';
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
  const todayStr = today();
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

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
        <Link className="btn btn-primary" to="/documents/new">
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
          {rows.map(({ doc, pages }) => {
            const daysLeft = doc.expiryDate ? daysBetween(todayStr, doc.expiryDate) : null;
            return (
              <li key={doc.id}>
                <Link className="list-row" to={`/documents/${doc.id}`}>
                  <Thumb page={pages[0]} />
                  <span className="list-main">
                    <span className="list-title">{doc.title}</span>
                    <span className="list-sub">
                      {t('documents.photoCount', { count: pages.length })}
                      {doc.expiryDate && ` · ${t('documents.expiresOn', { date: dateFmt.format(new Date(`${doc.expiryDate}T00:00:00Z`)) })}`}
                      {doc.tags.length > 0 && ` · ${doc.tags.join(', ')}`}
                    </span>
                  </span>
                  {daysLeft !== null && daysLeft <= DOCUMENT_LEAD_DAYS && <DocumentExpiryBadge daysLeft={daysLeft} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

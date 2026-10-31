import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { today } from '@/modules/inventory/domain/dates';
import { expiringDocuments, type DocumentExpiry } from './expiry';
import { useDocuments } from './store';

/** Documentos vencidos o que vencen en los próximos 60 días. */
export function useExpiringDocuments(): DocumentExpiry[] {
  const documents = useDocuments((s) => s.documents);
  return useMemo(() => expiringDocuments(documents.values(), today()), [documents]);
}

export function DocumentExpiryBadge({ daysLeft }: { daysLeft: number }) {
  const { t } = useTranslation();
  if (daysLeft < 0) return <span className="pill pill-danger">{t('alerts.expired', { count: -daysLeft })}</span>;
  return <span className="pill pill-warn">{daysLeft === 0 ? t('alerts.expiresToday') : t('alerts.expiresIn', { count: daysLeft })}</span>;
}

export function DocumentExpiryList({ rows, limit }: { rows: DocumentExpiry[]; limit?: number }) {
  return (
    <ul className="list">
      {rows.slice(0, limit).map(({ document, daysLeft }) => (
        <li key={document.id}>
          <Link className="list-row" to={`/documents/${document.id}`}>
            <FileText size={22} aria-hidden style={{ color: daysLeft < 0 ? 'var(--danger)' : 'var(--warn)', flex: 'none' }} />
            <span className="list-main">
              <span className="list-title">{document.title}</span>
            </span>
            <DocumentExpiryBadge daysLeft={daysLeft} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

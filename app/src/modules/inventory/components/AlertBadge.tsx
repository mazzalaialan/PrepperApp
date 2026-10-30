import { useTranslation } from 'react-i18next';
import type { LotAlert } from '../domain/alerts';

export function AlertBadge({ alert }: { alert: LotAlert }) {
  const { t } = useTranslation();
  const text = (() => {
    switch (alert.kind) {
      case 'expired':
        return t('alerts.expired', { count: -(alert.daysLeft ?? 0) });
      case 'expiring':
        return alert.daysLeft === 0 ? t('alerts.expiresToday') : t('alerts.expiresIn', { count: alert.daysLeft });
      case 'capacityEmpty':
        return t('alerts.capacityEmpty');
      case 'capacityLow':
        return t('alerts.capacityLow', { pct: Math.round(alert.pct ?? 0) });
    }
  })();
  const tone = alert.kind === 'expired' || alert.kind === 'capacityEmpty' ? 'danger' : 'warn';
  return <span className={`pill pill-${tone}`}>{text}</span>;
}

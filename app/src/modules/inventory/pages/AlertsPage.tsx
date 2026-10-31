import { useTranslation } from 'react-i18next';
import { DocumentExpiryList, useExpiringDocuments } from '@/modules/documents/DocumentExpiryList';
import { RecommendationShortageList, useRecommendationShortages } from '@/modules/recommendations/RecommendationShortageList';
import { AlertList, ShortageList } from '../components/AlertList';
import { useAlerts, useShortages } from '../selectors';

export function AlertsPage() {
  const { t } = useTranslation();
  const alerts = useAlerts();
  const shortages = useShortages();
  const recShortages = useRecommendationShortages();
  const docs = useExpiringDocuments();

  return (
    <>
      <h1 className="page-title">{t('modules.alerts.title')}</h1>
      {alerts.length === 0 && shortages.length === 0 && recShortages.length === 0 && docs.length === 0 && (
        <p className="empty">{t('alerts.allGood')}</p>
      )}
      {docs.length > 0 && (
        <>
          <h2 className="section-title">{t('alerts.documentsTitle')}</h2>
          <DocumentExpiryList rows={docs} />
        </>
      )}
      {alerts.length > 0 && (
        <>
          <h2 className="section-title">{t('alerts.lotsTitle')}</h2>
          <AlertList alerts={alerts} />
        </>
      )}
      {shortages.length > 0 && (
        <>
          <h2 className="section-title">{t('alerts.shortagesTitle')}</h2>
          <ShortageList shortages={shortages} />
        </>
      )}
      {recShortages.length > 0 && (
        <>
          <h2 className="section-title">{t('alerts.recommendationsTitle')}</h2>
          <RecommendationShortageList shortages={recShortages} />
        </>
      )}
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { AlertList, ShortageList } from '../components/AlertList';
import { useAlerts, useShortages } from '../selectors';

export function AlertsPage() {
  const { t } = useTranslation();
  const alerts = useAlerts();
  const shortages = useShortages();

  return (
    <>
      <h1 className="page-title">{t('modules.alerts.title')}</h1>
      {alerts.length === 0 && shortages.length === 0 && <p className="empty">{t('alerts.allGood')}</p>}
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
    </>
  );
}

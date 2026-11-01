import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BellRing, CircleCheck } from 'lucide-react';
import { AlertList, ShortageList } from '@/modules/inventory/components/AlertList';
import { DocumentExpiryList, useExpiringDocuments } from '@/modules/documents/DocumentExpiryList';
import { useAlerts, useShortages } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { RecommendationShortageList, useRecommendationShortages } from '@/modules/recommendations/RecommendationShortageList';
import { SECTIONS } from '@/modules/registry';
import { ModuleGrid } from '@/ui/ModuleGrid';

const HOME_ALERT_LIMIT = 5;

function AlertSummary() {
  const { t } = useTranslation();
  const hasItems = useInventory((s) => s.items.size > 0);
  const alerts = useAlerts();
  const shortages = useShortages();
  const recShortages = useRecommendationShortages();
  const docs = useExpiringDocuments();
  const total = alerts.length + shortages.length + recShortages.length + docs.length;
  // Los documentos van primero: renovarlos lleva turnos y semanas de trámite.
  const left = HOME_ALERT_LIMIT - docs.length;

  if (total === 0) {
    return (
      <section className="card summary">
        <CircleCheck size={24} style={{ color: 'var(--ok)' }} aria-hidden />
        <div>
          <h2>{t('home.alertsTitle')}</h2>
          <p className="hint">{hasItems ? t('alerts.allGood') : t('home.alertsEmpty')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack">
      <div className="summary">
        <BellRing size={24} style={{ color: 'var(--warn)' }} aria-hidden />
        <h2 style={{ flex: 1 }}>{t('home.alertsCount', { count: total })}</h2>
        <Link to="/inventory/alerts">{t('home.seeAll')}</Link>
      </div>
      {docs.length > 0 && <DocumentExpiryList rows={docs} limit={HOME_ALERT_LIMIT} />}
      {left > 0 && alerts.length > 0 && <AlertList alerts={alerts} limit={left} />}
      {alerts.length < left && shortages.length > 0 && <ShortageList shortages={shortages.slice(0, left - alerts.length)} />}
      {alerts.length + shortages.length < left && recShortages.length > 0 && (
        <RecommendationShortageList shortages={recShortages} limit={left - alerts.length - shortages.length} />
      )}
    </section>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  return (
    <>
      <AlertSummary />
      {SECTIONS.map((section) => (
        <Fragment key={section}>
          <h2 className="section-title">{t(`sections.${section}`)}</h2>
          <ModuleGrid section={section} />
        </Fragment>
      ))}
      <footer className="home-footer">
        <Link to="/about">{t('about.footer', { version: __APP_VERSION__ })}</Link>
      </footer>
    </>
  );
}

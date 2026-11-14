import { useTranslation } from 'react-i18next';
import { NavigationNotice } from './NavigationNotice';
import { TidesCard } from './TidesCard';

/** Navegación: mareas (hoy), y más adelante nivel de ríos y oleaje. Todo orientativo. */
export function NavigationPage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.navigation.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.intro')}
      </p>
      <NavigationNotice />
      <TidesCard />
    </div>
  );
}

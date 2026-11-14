import { useTranslation } from 'react-i18next';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { NavigationNotice } from './NavigationNotice';
import { RiversCard } from './RiversCard';
import { TidesCard } from './TidesCard';
import { WavesCard } from './WavesCard';

/** Navegación: niveles de los ríos de Argentina, mareas y oleaje con viento. Todo orientativo. */
export function NavigationPage() {
  const { t } = useTranslation();
  const { place, picker } = usePlacePicker();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.navigation.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.intro')}
      </p>
      <NavigationNotice />
      {picker}
      <RiversCard place={place} />
      <TidesCard place={place} />
      <WavesCard place={place} />
    </div>
  );
}

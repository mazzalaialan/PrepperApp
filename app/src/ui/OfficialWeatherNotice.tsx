import { useTranslation } from 'react-i18next';

/**
 * Aclaración pedida por el SMN: en Argentina, las alertas meteorológicas y
 * los avisos oficiales a la población son competencia exclusiva del SMN; la
 * app usa datos meteorológicos solo como información orientativa.
 */
export function OfficialWeatherNotice() {
  const { t } = useTranslation();
  return (
    <p className="hint" style={{ margin: 0 }} data-testid="official-weather-notice">
      {t('legal.smn')}{' '}
      <a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noreferrer">
        {t('legal.smnLink')}
      </a>
    </p>
  );
}

import { useTranslation } from 'react-i18next';
import { COUNTRIES, useSettings } from '@/core/settings/settings';

/** País de los números de emergencia (y de la guía de primeros auxilios). Queda guardado. */
export function CountrySwitch() {
  const { t } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const update = useSettings((s) => s.update);
  return (
    <div className="chips" role="group" aria-label={t('country.label')}>
      {COUNTRIES.map((c) => (
        <button key={c} type="button" className="chip" aria-pressed={country === c} onClick={() => void update({ country: c })}>
          {t(`country.${c}`)}
        </button>
      ))}
    </div>
  );
}

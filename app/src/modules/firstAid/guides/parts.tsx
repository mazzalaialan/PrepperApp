import { useTranslation } from 'react-i18next';
import { Building2, Trees } from 'lucide-react';
import { useSettings, type FirstAidEnv } from '@/core/settings/settings';

/** Idioma del contenido de la guía. */
export function useLang(): 'es' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('en') ? 'en' : 'es';
}

/** Ciudad (la ayuda llega en minutos) o zona agreste (puede tardar horas). Queda guardado. */
export function EnvSwitch() {
  const { t } = useTranslation();
  const env = useSettings((s) => s.settings.firstAidEnv);
  const update = useSettings((s) => s.update);
  const option = (value: FirstAidEnv, Icon: typeof Trees) => (
    <button type="button" className="chip guide-env" aria-pressed={env === value} onClick={() => void update({ firstAidEnv: value })}>
      <Icon size={16} aria-hidden /> {t(`guides.env.${value}`)}
    </button>
  );
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="chips" role="group" aria-label={t('guides.env.label')}>
        {option('city', Building2)}
        {option('wild', Trees)}
      </div>
      <p className="hint" style={{ margin: 0 }}>{t(`guides.env.${env}Hint`)}</p>
    </div>
  );
}

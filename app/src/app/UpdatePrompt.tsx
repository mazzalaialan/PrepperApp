import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Avisa cuando hay una versión nueva; nunca recarga sola (podría interrumpir una carga de datos). */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="toast" role="status">
      <span>{t('pwa.updateAvailable')}</span>
      <button className="btn btn-primary" type="button" onClick={() => void updateServiceWorker(true)}>
        {t('pwa.update')}
      </button>
    </div>
  );
}

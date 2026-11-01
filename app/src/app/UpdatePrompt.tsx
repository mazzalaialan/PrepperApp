import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Avisa cuando hay una versión nueva; nunca recarga sola (podría interrumpir una carga de datos).
 * Está a nivel de toda la app: se ve también en el login, donde conviene actualizar porque
 * recargar bloquea la bóveda y adentro obliga a volver a entrar.
 */
export function UpdatePrompt({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || !visible) return null;

  return (
    <div className="toast" role="status" data-testid="update-prompt">
      <span>{t('pwa.updateAvailable')}</span>
      <button className="btn btn-primary" type="button" onClick={() => void updateServiceWorker(true)}>
        {t('pwa.update')}
      </button>
    </div>
  );
}

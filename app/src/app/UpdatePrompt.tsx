import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Avisa cuando hay una versión nueva; nunca recarga sola (podría interrumpir una carga de datos).
 * Está a nivel de toda la app: se ve también en el login, donde conviene actualizar porque
 * recargar bloquea la bóveda y adentro obliga a volver a entrar.
 *
 * - Apenas arranca, el service worker busca si hay versión nueva; mientras se baja ya se avisa
 *   ("Bajando la versión nueva…") y el botón Actualizar aparece cuando está lista.
 * - "Más tarde" la oculta hasta cerrar la app: al volver a abrirla pregunta otra vez.
 */
export function UpdatePrompt({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [later, setLater] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Solo es "versión nueva" si ya hay una funcionando (la primera instalación no se avisa).
      const watch = (worker: ServiceWorker | null) => {
        if (!worker || !navigator.serviceWorker.controller) return;
        setDownloading(true);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') setDownloading(false);
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      // Buscar ya, sin esperar a que el navegador lo haga por su cuenta.
      void registration.update().catch(() => undefined);
    },
  });

  if (!visible || later || (!needRefresh && !downloading)) return null;

  return (
    <div className="toast" role="status" data-testid="update-prompt">
      <span>{t(needRefresh ? 'pwa.updateAvailable' : 'pwa.downloading')}</span>
      {needRefresh && (
        <button className="btn btn-primary" type="button" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.update')}
        </button>
      )}
      <button className="btn" type="button" onClick={() => setLater(true)} data-testid="update-later">
        {t('pwa.later')}
      </button>
    </div>
  );
}

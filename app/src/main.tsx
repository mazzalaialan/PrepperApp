import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { useCapabilities } from './core/capabilities/capabilities';
import { initI18n } from './core/i18n/i18n';
import { scheduleAlertSync } from './core/notifications/notifications';
import { onAlertIndexChange } from './modules/inventory/store';
import { useVault } from './core/security/useVault';
import { useSettings } from './core/settings/settings';
import './styles/app.css';

async function bootstrap() {
  await useSettings.getState().load();
  const { language } = useSettings.getState().settings;
  await initI18n(language);
  document.documentElement.lang = language;
  // La detección de sensores tarda ~1,5 s: no bloquea el arranque.
  void useCapabilities.getState().detect();
  // Con servidor configurado, cada cambio de alertas se le envía (agrupado).
  onAlertIndexChange(scheduleAlertSync);
  await useVault.getState().refresh();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();

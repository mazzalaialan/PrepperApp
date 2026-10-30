import { useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { useAutoLock } from '@/core/security/useAutoLock';
import { useVault } from '@/core/security/useVault';
import { useSettings, type Theme } from '@/core/settings/settings';
import { AlertsPage } from '@/modules/inventory/pages/AlertsPage';
import { CategoriesPage } from '@/modules/inventory/pages/CategoriesPage';
import { ItemEditPage } from '@/modules/inventory/pages/ItemEditPage';
import { ItemsPage } from '@/modules/inventory/pages/ItemsPage';
import { LocationsPage } from '@/modules/inventory/pages/LocationsPage';
import { HomePage } from './pages/HomePage';
import { SectionPage } from './pages/SectionPage';
import { SettingsPage } from './pages/SettingsPage';
import { NewPasswordScreen } from './screens/NewPasswordScreen';
import { RecoveryKeyScreen } from './screens/RecoveryKeyScreen';
import { SetupScreen } from './screens/SetupScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { Shell } from './Shell';

// Hash router: funciona en GitHub Pages y offline sin configurar el servidor.
const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/inventory', element: <SectionPage section="inventory" /> },
      { path: '/inventory/items', element: <ItemsPage /> },
      { path: '/inventory/items/:id', element: <ItemEditPage /> },
      { path: '/inventory/locations', element: <LocationsPage /> },
      { path: '/inventory/categories', element: <CategoriesPage /> },
      { path: '/inventory/alerts', element: <AlertsPage /> },
      { path: '/field', element: <SectionPage section="field" /> },
      { path: '/library', element: <SectionPage section="library" /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

const THEME_COLOR: Record<Theme, string> = { dark: '#121a24', light: '#f3efe7', red: '#000000' };

function useApplyTheme(theme: Theme) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
}

export function App() {
  const { status, setupInProgress, pendingRecoveryKey, mustChangePassword } = useVault();
  const { theme, autoLockMinutes } = useSettings((s) => s.settings);

  useApplyTheme(theme);
  useAutoLock(autoLockMinutes);

  if (pendingRecoveryKey) return <RecoveryKeyScreen recoveryKey={pendingRecoveryKey} />;
  if (setupInProgress) return <SetupScreen />;

  switch (status) {
    case 'loading':
      return null;
    case 'uninitialized':
      return <SetupScreen />;
    case 'locked':
      return <UnlockScreen />;
    case 'unlocked':
      return mustChangePassword ? <NewPasswordScreen /> : <RouterProvider router={router} />;
  }
}

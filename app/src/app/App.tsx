import { useEffect } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useAutoLock } from '@/core/security/useAutoLock';
import { useVault } from '@/core/security/useVault';
import { useSettings, type Theme } from '@/core/settings/settings';
import { AstronomyPage } from '@/modules/astronomy/AstronomyPage';
import { BackupPage } from '@/modules/backup/BackupPage';
import { DocumentEditPage } from '@/modules/documents/DocumentEditPage';
import { DocumentsPage } from '@/modules/documents/DocumentsPage';
import { KitPage } from '@/modules/firstAid/KitPage';
import { KitsPage } from '@/modules/firstAid/KitsPage';
import { MedicalEditPage } from '@/modules/firstAid/MedicalEditPage';
import { MedicalPage } from '@/modules/firstAid/MedicalPage';
import { AlertsPage } from '@/modules/inventory/pages/AlertsPage';
import { CategoriesPage } from '@/modules/inventory/pages/CategoriesPage';
import { ItemEditPage } from '@/modules/inventory/pages/ItemEditPage';
import { ItemsPage } from '@/modules/inventory/pages/ItemsPage';
import { LocationsPage } from '@/modules/inventory/pages/LocationsPage';
import { CompassPage } from '@/modules/compass/CompassPage';
import { RecommendationsPage } from '@/modules/recommendations/RecommendationsPage';
import { InclinometerPage } from '@/modules/inclinometer/InclinometerPage';
import { GoToPage } from '@/modules/waypoints/GoToPage';
import { RouteEditPage } from '@/modules/waypoints/RouteEditPage';
import { RouteGoPage } from '@/modules/waypoints/RouteGoPage';
import { RoutesPage } from '@/modules/waypoints/RoutesPage';
import { WeatherPage } from '@/modules/weather/WeatherPage';
import { WaypointEditPage } from '@/modules/waypoints/WaypointEditPage';
import { WaypointsPage } from '@/modules/waypoints/WaypointsPage';
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
      { path: '/inventory/backup', element: <BackupPage /> },
      { path: '/inventory/recommendations', element: <RecommendationsPage /> },
      { path: '/first-aid', element: <SectionPage section="firstAid" /> },
      { path: '/first-aid/kits', element: <KitsPage /> },
      { path: '/first-aid/kits/:id', element: <KitPage /> },
      { path: '/first-aid/medical', element: <MedicalPage /> },
      { path: '/first-aid/medical/:id', element: <MedicalEditPage /> },
      { path: '/documents', element: <DocumentsPage /> },
      { path: '/documents/:id', element: <DocumentEditPage /> },
      { path: '/transfer', element: <BackupPage /> },
      { path: '/orientation', element: <SectionPage section="orientation" /> },
      { path: '/orientation/waypoints', element: <WaypointsPage /> },
      { path: '/orientation/waypoints/:id', element: <WaypointEditPage /> },
      { path: '/orientation/waypoints/:id/go', element: <GoToPage /> },
      { path: '/orientation/compass', element: <CompassPage /> },
      { path: '/orientation/inclinometer', element: <InclinometerPage /> },
      { path: '/orientation/routes', element: <RoutesPage /> },
      { path: '/orientation/routes/:id', element: <RouteEditPage /> },
      { path: '/orientation/routes/:id/go/:step', element: <RouteGoPage /> },
      { path: '/weather', element: <SectionPage section="weather" /> },
      { path: '/weather/sky', element: <AstronomyPage /> },
      { path: '/weather/forecast', element: <WeatherPage /> },
      { path: '/garden', element: <SectionPage section="garden" /> },
      // Ruta de la sección "Campo" (v0.3), dividida en Orientación y Meteorología.
      { path: '/field', element: <Navigate to="/orientation" replace /> },
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

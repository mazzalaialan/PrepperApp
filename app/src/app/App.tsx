import { lazy, Suspense, useEffect } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useAutoLock } from '@/core/security/useAutoLock';
import { useVault } from '@/core/security/useVault';
import { useSettings, type Theme } from '@/core/settings/settings';
import { useEffectiveTheme } from '@/core/settings/theme';
import { useBatterySaver } from '@/core/power/saver';
import { AstronomyPage } from '@/modules/astronomy/AstronomyPage';
import { BackupPage } from '@/modules/backup/BackupPage';
import { SharePage } from '@/modules/share/SharePage';
import { DocumentEditPage } from '@/modules/documents/DocumentEditPage';
import { DocumentsPage } from '@/modules/documents/DocumentsPage';
import { KitPage } from '@/modules/firstAid/KitPage';
import { KitsPage } from '@/modules/firstAid/KitsPage';
import { MedicalEditPage } from '@/modules/firstAid/MedicalEditPage';
import { MedicalPage } from '@/modules/firstAid/MedicalPage';
import { ContactEditPage } from '@/modules/emergency/ContactEditPage';
import { ContactsPage } from '@/modules/emergency/ContactsPage';
import { FrequencyEditPage } from '@/modules/emergency/FrequencyEditPage';
import { MyLocationPage } from '@/modules/emergency/MyLocationPage';
import { NearbyPage } from '@/modules/emergency/NearbyPage';
import { RadioPage } from '@/modules/emergency/RadioPage';
import { GuidesPage } from '@/modules/firstAid/guides/GuidesPage';
import { GuideTopicPage } from '@/modules/firstAid/guides/GuideTopicPage';
import { AlertsPage } from '@/modules/inventory/pages/AlertsPage';
import { CategoriesPage } from '@/modules/inventory/pages/CategoriesPage';
import { ItemEditPage } from '@/modules/inventory/pages/ItemEditPage';
import { ItemsPage } from '@/modules/inventory/pages/ItemsPage';
import { LocationsPage } from '@/modules/inventory/pages/LocationsPage';
import { CompassPage } from '@/modules/compass/CompassPage';
import { RecommendationsPage } from '@/modules/recommendations/RecommendationsPage';
import { StarMapPage } from '@/modules/starmap/StarMapPage';
import { InclinometerPage } from '@/modules/inclinometer/InclinometerPage';
import { GoToPage } from '@/modules/waypoints/GoToPage';
import { RouteEditPage } from '@/modules/waypoints/RouteEditPage';
import { RouteGoPage } from '@/modules/waypoints/RouteGoPage';
import { TrackFollowPage } from '@/modules/tracks/TrackFollowPage';
import { TrackPage } from '@/modules/tracks/TrackPage';
import { TracksPage } from '@/modules/tracks/TracksPage';
import { WeatherPage } from '@/modules/weather/WeatherPage';
import { WeatherMapPage } from '@/modules/weathermap/WeatherMapPage';
import { WaypointEditPage } from '@/modules/waypoints/WaypointEditPage';
import { WaypointsPage } from '@/modules/waypoints/WaypointsPage';
import { BedPage } from '@/modules/garden/BedPage';
import { AnchorPage, AnchorsPage } from '@/modules/knots/AnchorPages';
import { GlossaryPage, RopesPage } from '@/modules/knots/InfoPages';
import { KnotGuidePage } from '@/modules/knots/KnotGuidePage';
import { KnotPage } from '@/modules/knots/KnotPage';
import { CropPage } from '@/modules/garden/CropPage';
import { GardenCalendarPage } from '@/modules/garden/GardenCalendarPage';
import { GardenPage } from '@/modules/garden/GardenPage';
import { HomePage } from './pages/HomePage';
import { SectionPage } from './pages/SectionPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { NewPasswordScreen } from './screens/NewPasswordScreen';
import { RecoveryKeyScreen } from './screens/RecoveryKeyScreen';
import { SetupScreen } from './screens/SetupScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { UpdatePrompt } from './UpdatePrompt';
import { Shell } from './Shell';

// MapLibre pesa ~1 MB: se carga recién al abrir los mapas (igual queda guardado para usarlo sin conexión).
const MapsPage = lazy(() => import('@/modules/maps/MapsPage').then((m) => ({ default: m.MapsPage })));

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
      { path: '/settings/backup', element: <BackupPage /> },
      { path: '/settings/share', element: <SharePage /> },
      // Ruta anterior a v0.7.4 (el backup estaba en Inventario).
      { path: '/inventory/backup', element: <Navigate to="/settings/backup" replace /> },
      { path: '/inventory/recommendations', element: <RecommendationsPage /> },
      { path: '/first-aid', element: <SectionPage section="firstAid" /> },
      { path: '/first-aid/kits', element: <KitsPage /> },
      { path: '/first-aid/kits/:id', element: <KitPage /> },
      { path: '/first-aid/medical', element: <MedicalPage /> },
      { path: '/first-aid/medical/:id', element: <MedicalEditPage /> },
      { path: '/first-aid/contacts', element: <ContactsPage /> },
      { path: '/first-aid/contacts/nearby', element: <NearbyPage /> },
      { path: '/first-aid/contacts/:id', element: <ContactEditPage /> },
      { path: '/first-aid/location', element: <MyLocationPage /> },
      { path: '/first-aid/guides', element: <GuidesPage /> },
      { path: '/first-aid/guides/:topicId', element: <GuideTopicPage /> },
      { path: '/first-aid/radio', element: <RadioPage /> },
      { path: '/first-aid/radio/:id', element: <FrequencyEditPage /> },
      { path: '/documents', element: <DocumentsPage /> },
      { path: '/documents/:id', element: <DocumentEditPage /> },
      { path: '/transfer', element: <BackupPage /> },
      { path: '/orientation', element: <SectionPage section="orientation" /> },
      { path: '/orientation/waypoints', element: <WaypointsPage /> },
      { path: '/orientation/waypoints/:id', element: <WaypointEditPage /> },
      { path: '/orientation/waypoints/:id/go', element: <GoToPage /> },
      { path: '/orientation/compass', element: <CompassPage /> },
      { path: '/orientation/inclinometer', element: <InclinometerPage /> },
      { path: '/orientation/starmap', element: <StarMapPage /> },
      {
        path: '/orientation/maps',
        element: (
          <Suspense fallback={null}>
            <MapsPage />
          </Suspense>
        ),
      },
      // Las rutas se listan abajo de los waypoints (antes tenían pantalla propia).
      { path: '/orientation/routes', element: <Navigate to="/orientation/waypoints" replace /> },
      { path: '/orientation/tracks', element: <TracksPage /> },
      { path: '/orientation/tracks/:id', element: <TrackPage /> },
      { path: '/orientation/tracks/:id/follow', element: <TrackFollowPage /> },
      { path: '/orientation/routes/:id', element: <RouteEditPage /> },
      { path: '/orientation/routes/:id/go/:step', element: <RouteGoPage /> },
      { path: '/weather', element: <SectionPage section="weather" /> },
      { path: '/weather/sky', element: <AstronomyPage /> },
      { path: '/weather/forecast', element: <WeatherPage /> },
      { path: '/weather/map', element: <WeatherMapPage /> },
      { path: '/knots', element: <SectionPage section="knots" /> },
      { path: '/knots/guide', element: <KnotGuidePage /> },
      { path: '/knots/guide/:id', element: <KnotPage /> },
      { path: '/knots/anchors', element: <AnchorsPage /> },
      { path: '/knots/anchors/:id', element: <AnchorPage /> },
      { path: '/knots/ropes', element: <RopesPage /> },
      { path: '/knots/glossary', element: <GlossaryPage /> },
      { path: '/garden', element: <SectionPage section="garden" /> },
      { path: '/garden/calendar', element: <GardenCalendarPage /> },
      { path: '/garden/crops/:id', element: <CropPage /> },
      { path: '/garden/beds', element: <GardenPage /> },
      { path: '/garden/beds/:id', element: <BedPage /> },
      // Ruta de la sección "Campo" (v0.3), dividida en Orientación y Meteorología.
      { path: '/field', element: <Navigate to="/orientation" replace /> },
      { path: '/library', element: <SectionPage section="library" /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/about', element: <AboutPage /> },
    ],
  },
]);

const THEME_COLOR: Record<Theme, string> = { dark: '#121a24', light: '#f3efe7', red: '#000000', saver: '#000000' };

function useApplyTheme(theme: Theme, saver: boolean) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  // Aparte del tema: con el rojo nocturno encima, el ahorro (sin animaciones) sigue.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-saver', saver);
  }, [saver]);
}

export function App() {
  const status = useVault((s) => s.status);
  const autoLockMinutes = useSettings((s) => s.settings.autoLockMinutes);
  const theme = useEffectiveTheme();

  useApplyTheme(theme, useBatterySaver());
  useAutoLock(autoLockMinutes);

  return (
    <>
      <Screen />
      <UpdatePrompt visible={status !== 'loading'} />
    </>
  );
}

function Screen() {
  const { status, setupInProgress, pendingRecoveryKey, mustChangePassword } = useVault();

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

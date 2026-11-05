import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CloudSun,
  Compass,
  Ellipsis,
  FileText,
  House,
  Lock,
  Package,
  Settings,
  Siren,
  Sprout,
} from 'lucide-react';
import { useVault } from '@/core/security/useVault';
import { useCountryPrefetch } from '@/modules/emergency/country';
import { BrandMark } from '@/ui/Brand';
import { Dialog } from '@/ui/Dialog';
import { PocketScreen, RecordingBar } from '@/modules/tracks/Recording';
import { RainNotices } from '@/modules/weather/RainNotices';
import { useZoneForecastRefresh } from '@/modules/maps/zoneForecast';
import { useRainServerSync } from '@/modules/weather/rainServer';
import { useGardenServerSync } from '@/modules/garden/serverSync';
import { useStockServerSync } from '@/modules/inventory/stockServer';
import { useRainWatcher } from '@/modules/weather/rainWatch';
import { PortableUpdateNotice } from './PortableUpdateNotice';

// En el celular entran seis botones: cinco secciones y "Más" con el resto.
// En pantallas anchas el riel lateral muestra todas. Ajustes va en la barra superior.
const NAV = [
  { to: '/', key: 'home', icon: House },
  { to: '/first-aid', key: 'firstAid', icon: Siren },
  { to: '/documents', key: 'documents', icon: FileText },
  { to: '/orientation', key: 'orientation', icon: Compass },
  { to: '/weather', key: 'weather', icon: CloudSun },
] as const;

const MORE = [
  { to: '/inventory', key: 'inventory', icon: Package },
  { to: '/garden', key: 'garden', icon: Sprout },
  { to: '/library', key: 'library', icon: BookOpen },
] as const;

export function Shell() {
  const { t } = useTranslation();
  const lock = useVault((s) => s.lock);
  useCountryPrefetch();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some((m) => pathname.startsWith(m.to));
  useRainWatcher();
  useRainServerSync();
  useGardenServerSync();
  useStockServerSync();
  useZoneForecastRefresh();

  return (
    <div className="shell">
      <nav className="bottomnav" aria-label="Principal">
        {NAV.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={24} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
        {MORE.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className="nav-wide">
            <Icon size={24} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
        <button
          type="button"
          className={`nav-more${inMore ? ' active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
        >
          <Ellipsis size={24} aria-hidden />
          {t('nav.more')}
        </button>
      </nav>
      {moreOpen && (
        <Dialog title={t('nav.more')} onClose={() => setMoreOpen(false)}>
          <ul className="list">
            {MORE.map(({ to, key, icon: Icon }) => (
              <li key={to}>
                <Link className="list-row" to={to} onClick={() => setMoreOpen(false)}>
                  <Icon size={22} aria-hidden style={{ color: 'var(--accent)' }} />
                  <span className="list-main">
                    <span className="list-title">{t(`sections.${key}`)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      <div className="shell-main">
        <header className="topbar">
          <BrandMark />
          <h1>{t('app.name')}</h1>
          <Link className="icon-btn" to="/settings" aria-label={t('nav.settings')} title={t('nav.settings')}>
            <Settings size={22} />
          </Link>
          <button className="icon-btn" type="button" onClick={lock} aria-label={t('settings.lockNow')} title={t('settings.lockNow')}>
            <Lock size={22} />
          </button>
        </header>
        <PortableUpdateNotice />
        <RainNotices />
        <RecordingBar />
        <PocketScreen />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BookOpen, CloudSun, Compass, House, Lock, Package, Settings, Sprout } from 'lucide-react';
import { useVault } from '@/core/security/useVault';
import { BrandMark } from '@/ui/Brand';
import { UpdatePrompt } from './UpdatePrompt';

// Ajustes va en la barra superior: seis destinos es el máximo que entra en un celular.
const NAV = [
  { to: '/', key: 'home', icon: House },
  { to: '/inventory', key: 'inventory', icon: Package },
  { to: '/orientation', key: 'orientation', icon: Compass },
  { to: '/weather', key: 'weather', icon: CloudSun },
  { to: '/garden', key: 'garden', icon: Sprout },
  { to: '/library', key: 'library', icon: BookOpen },
] as const;

export function Shell() {
  const { t } = useTranslation();
  const lock = useVault((s) => s.lock);

  return (
    <div className="shell">
      <nav className="bottomnav" aria-label="Principal">
        {NAV.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={24} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>
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
        <main className="content">
          <Outlet />
        </main>
      </div>
      <UpdatePrompt />
    </div>
  );
}

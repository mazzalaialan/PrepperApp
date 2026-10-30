import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Compass, House, Lock, Package, Settings } from 'lucide-react';
import { useVault } from '@/core/security/useVault';
import { BrandMark } from '@/ui/Brand';
import { UpdatePrompt } from './UpdatePrompt';

const NAV = [
  { to: '/', key: 'home', icon: House },
  { to: '/inventory', key: 'inventory', icon: Package },
  { to: '/field', key: 'field', icon: Compass },
  { to: '/library', key: 'library', icon: BookOpen },
  { to: '/settings', key: 'settings', icon: Settings },
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

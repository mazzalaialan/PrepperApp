import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Route as RouteIcon } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { routeLength, routePoints, useWaypoints } from './store';

export function RoutesPage() {
  const { t, i18n } = useTranslation();
  const routes = useWaypoints((s) => s.routes);
  const waypoints = useWaypoints((s) => s.waypoints);
  const units = useSettings((s) => s.settings.units);
  const rows = useMemo(
    () =>
      [...routes.values()]
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
        .map((route) => ({ route, points: routePoints(route, waypoints) })),
    [routes, waypoints, i18n.language],
  );

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.routes.title')}</h1>
        <Link className="btn btn-primary" to="/orientation/routes/new">
          <Plus size={20} /> {t('routes.new')}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="empty">{waypoints.size < 2 ? t('routes.needPoints') : t('routes.empty')}</p>
      ) : (
        <ul className="list">
          {rows.map(({ route, points }) => (
            <li key={route.id}>
              <Link className="list-row" to={`/orientation/routes/${route.id}`}>
                <RouteIcon size={22} aria-hidden style={{ color: 'var(--accent)', flex: 'none' }} />
                <span className="list-main">
                  <span className="list-title">{route.name}</span>
                  <span className="list-sub">
                    {t('routes.pointCount', { count: points.length })}
                    {points.length > 1 && ` · ${formatDistance(routeLength(points), units, i18n.language)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

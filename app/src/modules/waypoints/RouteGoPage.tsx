import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GoTo } from './GoToPage';
import { routePoints, useWaypoints } from './store';

/** Recorre una ruta punto por punto: `/orientation/routes/:id/go/:step` (desde 1). */
export function RouteGoPage() {
  const { id, step } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const route = useWaypoints((s) => (id ? s.routes.get(id) : undefined));
  const waypoints = useWaypoints((s) => s.waypoints);
  const loaded = useWaypoints((s) => s.loaded);
  if (!loaded) return null;

  const points = route ? routePoints(route, waypoints) : [];
  const index = Number(step) - 1;
  const target = points[index];
  if (!route || !target) {
    return (
      <p className="empty">
        {t('routes.notFound')} <Link to="/orientation/routes">{t('common.back')}</Link>
      </p>
    );
  }
  const go = (i: number) => navigate(`/orientation/routes/${route.id}/go/${i + 1}`, { replace: true });

  return (
    <GoTo
      key={`${target.id}-${index}`}
      target={target}
      backTo={`/orientation/routes/${route.id}`}
      route={{
        name: route.name,
        step: index + 1,
        total: points.length,
        next: points[index + 1],
        onPrev: index > 0 ? () => go(index - 1) : null,
        onNext: index < points.length - 1 ? () => go(index + 1) : null,
      }}
    />
  );
}

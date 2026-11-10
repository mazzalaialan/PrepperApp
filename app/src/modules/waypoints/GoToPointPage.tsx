import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { Waypoint } from '@/core/model/types';
import { GoTo } from './GoToPage';

/** Ir a unas coordenadas que no son un waypoint guardado (por ejemplo un hospital de "Buscar cercanos"). */
export function GoToPointPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const name = params.get('name')?.trim() || t('goto.pointName');
  const valid = params.has('lat') && params.has('lon') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const target = useMemo<Waypoint | null>(
    () => (valid ? ({ id: 'temp-point', name, lat, lon, alt: null, icon: 'pin', notes: '', rainAlerts: false, createdAt: 0, updatedAt: 0 } as unknown as Waypoint) : null),
    [valid, lat, lon, name],
  );
  if (!target) {
    return (
      <p className="empty">
        {t('waypoints.notFound')} <Link to="/first-aid">{t('common.back')}</Link>
      </p>
    );
  }
  return <GoTo target={target} backTo="/first-aid/contacts/nearby" />;
}

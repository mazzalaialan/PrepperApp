import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed } from 'lucide-react';
import { currentPosition } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { useWaypoints } from './store';

/**
 * Elegir dónde está algo (un cantero, una ubicación del inventario): uno de
 * "Mis waypoints", o crear uno en el momento con el GPS (con el nombre que se
 * le pasa). Las coordenadas quedan cifradas en el waypoint.
 */
export function WaypointField({
  id,
  label,
  value,
  onChange,
  newName,
  hint,
  noneLabel,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (waypointId: string | null) => void;
  /** Nombre del waypoint que se crea con el GPS. */
  newName: string;
  hint?: string;
  noneLabel?: string;
}) {
  const { t } = useTranslation();
  const waypoints = useWaypoints((s) => s.waypoints);
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const options = [...waypoints.values()].sort((a, b) => a.name.localeCompare(b.name));

  async function markHere() {
    setLocating(true);
    setGpsError(false);
    try {
      const fix = await currentPosition();
      const wp = newEntity<Waypoint>({ name: newName.trim() || t('place.myLocation'), lat: fix.lat, lon: fix.lon, alt: fix.alt, icon: 'pin', notes: '', rainAlerts: false });
      await saveWaypoint(wp);
      onChange(wp.id);
    } catch {
      setGpsError(true);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{noneLabel ?? t('waypointField.none')}</option>
        {options.map((wp) => (
          <option key={wp.id} value={wp.id}>
            {wp.name}
          </option>
        ))}
      </select>
      <button className="btn" type="button" onClick={() => void markHere()} disabled={locating}>
        <LocateFixed size={18} /> {locating ? t('waypointField.locating') : t('waypointField.markHere')}
      </button>
      {gpsError && <p className="error">{t('waypointField.gpsError')}</p>}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

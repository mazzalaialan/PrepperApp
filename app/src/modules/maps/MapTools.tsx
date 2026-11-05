import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Crosshair, MapPinPlus, Ruler, Trash2, Undo2 } from 'lucide-react';
import { Segmented } from '@/ui/Segmented';
import { cardinalOf, type LatLon } from '@/core/geo/geo';
import { declinationAt } from '@/core/sensors/heading';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import type { NewWaypointDraft } from '@/modules/waypoints/WaypointEditPage';
import { summarizePath, targetInfo, type PathSummary, type TargetInfo } from './measure';

export type MapTool = 'measure' | 'target';
/** Desde dónde se mide la dirección: tu ubicación o un punto que marcás en el mapa. */
type FromMode = 'here' | 'point';

interface Origin extends LatLon {
  alt?: number | null;
}

/** Perfil de altura del recorrido medido. */
function Profile({ profile }: { profile: [number, number][] }) {
  const { t } = useTranslation();
  if (profile.length < 2) return null;
  const total = profile.at(-1)![0] || 1;
  const hs = profile.map((p) => p[1]);
  const min = Math.min(...hs);
  const span = Math.max(10, Math.max(...hs) - min);
  const pts = profile.map(([d, h]) => `${((d / total) * 300).toFixed(1)},${(58 - ((h - min) / span) * 52).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 300 60" className="measure-profile" role="img" aria-label={t('mapTools.profile')} preserveAspectRatio="none">
      <polygon points={`0,60 ${pts} 300,60`} className="measure-profile-fill" />
      <polyline points={pts} className="measure-profile-line" />
    </svg>
  );
}

/**
 * Herramientas del mapa: medir (distancia en línea recta o un recorrido, con
 * desnivel) y dirección a un punto (desde tu ubicación o desde un primer punto).
 */
export function useMapTools(fix: (LatLon & { alt: number | null }) | null) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const [tool, setToolState] = useState<MapTool | null>(null);
  const [points, setPoints] = useState<LatLon[]>([]);
  const [summary, setSummary] = useState<PathSummary | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [target, setTarget] = useState<LatLon | null>(null);
  const [info, setInfo] = useState<TargetInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromMode, setFromMode] = useState<FromMode>('here');

  // Desde dónde: tu ubicación (si hay) o el primer punto que se toca.
  const usePoint = fromMode === 'point' || !fix;
  const from: Origin | null = usePoint ? origin : fix;

  function chooseFrom(mode: FromMode) {
    setFromMode(mode);
    setOrigin(null);
    setTarget(null);
    setInfo(null);
  }

  function setTool(next: MapTool | null) {
    setToolState(next);
    setPoints([]);
    setSummary(null);
    setOrigin(null);
    setTarget(null);
    setInfo(null);
  }

  function onMapClick(p: LatLon) {
    if (tool === 'measure') setPoints((list) => [...list, p]);
    else if (tool === 'target') {
      if (usePoint && !origin) setOrigin(p);
      else setTarget(p);
    }
  }

  useEffect(() => {
    if (points.length < 2) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void summarizePath(points).then((s) => {
      if (!cancelled) {
        setSummary(s);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [points]);

  const fromKey = from ? `${from.lat.toFixed(5)},${from.lon.toFixed(5)}` : '';
  useEffect(() => {
    if (!from || !target) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void targetInfo(from, target).then((r) => {
      if (!cancelled) {
        setInfo(r);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fromKey, target]);

  const dist = (m: number) => formatDistance(m, units, i18n.language);
  const alt = (m: number) => formatAltitude(Math.round(m), units, i18n.language);
  const deg = (v: number, digits = 0) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
  const bearingText = (b: number) => `${deg(Math.round(b) % 360)}° ${t(`geo.cardinal.${cardinalOf(b)}`)}`;

  const measureLine = useMemo(() => points.map((p) => [p.lon, p.lat] as [number, number]), [points]);
  const targetLine = useMemo(
    () => (from && (target || usePoint) ? { from: [from.lon, from.lat] as [number, number], to: target ? ([target.lon, target.lat] as [number, number]) : null } : null),
    [fromKey, target],
  );

  const toolbar = (
    <div className="chips map-tools" role="group" aria-label={t('mapTools.title')}>
      <button type="button" className="chip" aria-pressed={tool === 'measure'} onClick={() => setTool(tool === 'measure' ? null : 'measure')}>
        <Ruler size={16} aria-hidden /> {t('mapTools.measure')}
      </button>
      <button type="button" className="chip" aria-pressed={tool === 'target'} onClick={() => setTool(tool === 'target' ? null : 'target')}>
        <Crosshair size={16} aria-hidden /> {t('mapTools.target')}
      </button>
    </div>
  );

  let panel: ReactNode = null;
  if (tool === 'measure') {
    panel = (
      <section className="card stack" data-testid="measure-panel" aria-live="polite">
        <p className="hint" style={{ margin: 0 }}>
          {points.length === 0 ? t('mapTools.measureHint') : points.length === 1 ? t('mapTools.measureNext') : t('mapTools.measureMore')}
        </p>
        {points.length >= 2 && summary && (
          <>
            <p className="measure-big" data-testid="measure-distance">
              {dist(summary.distance)}
              <span className="hint"> · {points.length === 2 ? t('mapTools.straight') : t('mapTools.legs', { count: points.length - 1 })}</span>
            </p>
            {summary.ascent !== null ? (
              <>
                <p style={{ margin: 0 }} data-testid="measure-climb">
                  {t('mapTools.climb', { up: alt(summary.ascent), down: alt(summary.descent!) })}
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  {t('mapTools.range', { start: alt(summary.start!), end: alt(summary.end!), min: alt(summary.min!), max: alt(summary.max!) })}
                </p>
                <Profile profile={summary.profile} />
                <p className="hint" style={{ margin: 0 }}>
                  {t('mapTools.demNote')}
                </p>
              </>
            ) : (
              !busy && (
                <p className="hint" style={{ margin: 0 }} data-testid="measure-nodem">
                  {t('mapTools.noDem')}
                </p>
              )
            )}
          </>
        )}
        {points.length > 0 && (
          <div className="row-end">
            <button className="btn" type="button" onClick={() => setPoints((l) => l.slice(0, -1))}>
              <Undo2 size={18} /> {t('mapTools.undo')}
            </button>
            <button className="btn" type="button" onClick={() => setPoints([])}>
              <Trash2 size={18} /> {t('mapTools.clear')}
            </button>
          </div>
        )}
      </section>
    );
  } else if (tool === 'target') {
    const decl = target ? declinationAt(target.lat, target.lon) : 0;
    panel = (
      <section className="card stack" data-testid="target-panel" aria-live="polite">
        {fix && (
          <Segmented<FromMode>
            label={t('mapTools.from')}
            value={fromMode}
            options={[
              { value: 'here', label: t('mapTools.fromHere') },
              { value: 'point', label: t('mapTools.fromMapPoint') },
            ]}
            onChange={chooseFrom}
          />
        )}
        <p className="hint" style={{ margin: 0 }} data-testid="target-hint">
          {!usePoint ? t('mapTools.targetHintGps') : origin ? t('mapTools.targetHintTarget') : fix ? t('mapTools.targetHintPoint') : t('mapTools.targetHintOrigin')}
        </p>
        {from && target && info && (
          <>
            <p className="measure-big" data-testid="target-bearing">
              {bearingText(info.bearing)} · {dist(info.distance)}
            </p>
            <p style={{ margin: 0 }} data-testid="target-magnetic">
              {t('mapTools.magnetic', { value: bearingText(((info.bearing - decl) % 360 + 360) % 360) })}
            </p>
            <p className="hint" style={{ margin: 0 }}>
              {usePoint ? t('mapTools.fromPoint') : t('mapTools.fromGps')}
            </p>
            {info.targetAlt !== null ? (
              <p style={{ margin: 0 }} data-testid="target-alt">
                {t('mapTools.targetAlt', { alt: alt(info.targetAlt) })}
                {info.originAlt !== null &&
                  ` ${t(info.targetAlt >= info.originAlt ? 'mapTools.above' : 'mapTools.below', { diff: alt(Math.abs(info.targetAlt - info.originAlt)) })}`}
                {info.elevationAngle !== null &&
                  ` ${t(info.elevationAngle >= 0 ? 'mapTools.lookUp' : 'mapTools.lookDown', { deg: deg(Math.abs(info.elevationAngle), 1) })}`}
              </p>
            ) : (
              !busy && (
                <p className="hint" style={{ margin: 0 }}>
                  {t('mapTools.noDem')}
                </p>
              )
            )}
            <div className="row-end">
              <Link
                className="btn"
                to="/orientation/waypoints/new"
                state={{ lat: target.lat, lon: target.lon, alt: info.targetAlt !== null ? Math.round(info.targetAlt) : null } satisfies NewWaypointDraft}
              >
                <MapPinPlus size={18} /> {t('mapTools.saveWaypoint')}
              </Link>
              {usePoint && (
                <button className="btn" type="button" onClick={() => chooseFrom(fromMode)}>
                  <Undo2 size={18} /> {t('mapTools.newOrigin')}
                </button>
              )}
              <button className="btn" type="button" onClick={() => setTool('target')}>
                <Trash2 size={18} /> {t('mapTools.clear')}
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  return { tool, onMapClick, measure: measureLine, target: targetLine, toolbar, panel };
}

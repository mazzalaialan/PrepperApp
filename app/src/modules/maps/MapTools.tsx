import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Crosshair, LocateFixed, MapPin, MapPinPlus, Plus, Ruler, Trash2, Undo2 } from 'lucide-react';
import { Segmented } from '@/ui/Segmented';
import { cardinalOf, formatDecimal, type LatLon } from '@/core/geo/geo';
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

  // Acciones del menú del clic derecho (o mantener apretado en el celular).
  const [menu, setMenu] = useState<{ p: LatLon; x: number; y: number } | null>(null);
  const navigate = useNavigate();
  function measureFrom(p: LatLon) {
    setToolState('measure');
    setPoints([p]);
    setTarget(null);
    setOrigin(null);
  }
  function directionTo(p: LatLon) {
    setToolState('target');
    setPoints([]);
    // Con un origen marcado en el mapa se sigue desde ahí; si no, desde tu ubicación.
    if (!(tool === 'target' && fromMode === 'point' && origin)) {
      setFromMode('here');
      setOrigin(null);
    }
    setTarget(p);
  }
  function directionFrom(p: LatLon) {
    setToolState('target');
    setPoints([]);
    setFromMode('point');
    setOrigin(p);
    setTarget(null);
  }

  function onMapClick(p: LatLon) {
    setMenu(null);
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

  // Botones sobre el mapa (se ven en pantalla completa).
  const floating = (
    <div className="maps-tools-float">
      <button
        className="icon-btn maps-camera-btn"
        type="button"
        aria-pressed={tool === 'measure'}
        onClick={() => setTool(tool === 'measure' ? null : 'measure')}
        aria-label={t('mapTools.measure')}
        title={t('mapTools.measure')}
      >
        <Ruler size={20} />
      </button>
      <button
        className="icon-btn maps-camera-btn"
        type="button"
        aria-pressed={tool === 'target'}
        onClick={() => setTool(tool === 'target' ? null : 'target')}
        aria-label={t('mapTools.target')}
        title={t('mapTools.target')}
      >
        <Crosshair size={20} />
      </button>
    </div>
  );

  // Resumen corto encima del mapa, para la pantalla completa.
  let overlay: ReactNode = null;
  if (tool === 'measure') {
    overlay = (
      <div className="maps-tools-overlay" data-testid="tools-overlay">
        {points.length >= 2 && summary ? (
          <>
            <span className="fs-big">{dist(summary.distance)}</span>
            {summary.ascent !== null && <span>{t('mapTools.climbShort', { up: alt(summary.ascent), down: alt(summary.descent!) })}</span>}
          </>
        ) : (
          <span>{points.length === 0 ? t('mapTools.measureHint') : t('mapTools.measureNext')}</span>
        )}
        {points.length > 0 && (
          <span className="maps-tools-actions">
            <button className="btn btn-small" type="button" onClick={() => setPoints((l) => l.slice(0, -1))}>
              <Undo2 size={16} /> {t('mapTools.undo')}
            </button>
            <button className="btn btn-small" type="button" onClick={() => setPoints([])}>
              <Trash2 size={16} /> {t('mapTools.clear')}
            </button>
          </span>
        )}
      </div>
    );
  } else if (tool === 'target') {
    const decl = target ? declinationAt(target.lat, target.lon) : 0;
    overlay = (
      <div className="maps-tools-overlay" data-testid="tools-overlay">
        {from && target && info ? (
          <>
            <span className="fs-big">
              {bearingText(info.bearing)} · {dist(info.distance)}
            </span>
            <span>
              {t('mapTools.magneticShort', { value: bearingText((((info.bearing - decl) % 360) + 360) % 360) })}
              {info.targetAlt !== null && ` · ≈ ${alt(info.targetAlt)}`}
            </span>
          </>
        ) : (
          <span>{!usePoint ? t('mapTools.targetHintGps') : origin ? t('mapTools.targetHintTarget') : fix ? t('mapTools.targetHintPoint') : t('mapTools.targetHintOrigin')}</span>
        )}
        <span className="maps-tools-actions">
          {fix && (
            <button className="btn btn-small" type="button" onClick={() => chooseFrom(usePoint ? 'here' : 'point')}>
              {usePoint ? <LocateFixed size={16} /> : <MapPin size={16} />} {usePoint ? t('mapTools.fromHere') : t('mapTools.fromMapPoint')}
            </button>
          )}
          {usePoint && origin && (
            <button className="btn btn-small" type="button" onClick={() => chooseFrom(fromMode)}>
              <Undo2 size={16} /> {t('mapTools.newOrigin')}
            </button>
          )}
        </span>
      </div>
    );
  }

  // Menú contextual: se cierra con Escape o con un clic afuera.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close, true);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close, true);
    };
  }, [menu]);
  const act = (fn: () => void) => () => {
    fn();
    setMenu(null);
  };
  const menuNode = menu && (
    <div
      ref={menuRef}
      className="maps-menu"
      role="menu"
      data-testid="map-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="maps-menu-coords">{formatDecimal(menu.p)}</span>
      <button type="button" role="menuitem" onClick={act(() => measureFrom(menu.p))}>
        <Ruler size={16} aria-hidden /> {t('mapTools.menu.measureFrom')}
      </button>
      {tool === 'measure' && points.length > 0 && (
        <button type="button" role="menuitem" onClick={act(() => setPoints((l) => [...l, menu.p]))}>
          <Plus size={16} aria-hidden /> {t('mapTools.menu.addPoint')}
        </button>
      )}
      {(fix || (tool === 'target' && fromMode === 'point' && origin)) && (
        <button type="button" role="menuitem" onClick={act(() => directionTo(menu.p))}>
          <Crosshair size={16} aria-hidden /> {tool === 'target' && fromMode === 'point' && origin ? t('mapTools.menu.directionToFromOrigin') : t('mapTools.menu.directionTo')}
        </button>
      )}
      <button type="button" role="menuitem" onClick={act(() => directionFrom(menu.p))}>
        <MapPin size={16} aria-hidden /> {t('mapTools.menu.directionFrom')}
      </button>
      <button type="button" role="menuitem" onClick={act(() => void navigator.clipboard?.writeText(formatDecimal(menu.p)).catch(() => undefined))}>
        <Copy size={16} aria-hidden /> {t('mapTools.menu.copy')}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={act(() => navigate('/orientation/waypoints/new', { state: { lat: menu.p.lat, lon: menu.p.lon, alt: null } satisfies NewWaypointDraft }))}
      >
        <MapPinPlus size={16} aria-hidden /> {t('mapTools.saveWaypoint')}
      </button>
    </div>
  );

  return {
    tool,
    onMapClick,
    // El menú se abre hacia donde hay lugar (unos 240 × 280 px).
    onContextMenu: (p: LatLon, x: number, y: number, width: number, height: number) =>
      setMenu({ p, x: x + 240 > width ? Math.max(4, x - 240) : x, y: y + 280 > height ? Math.max(4, y - 280) : y }),
    closeMenu: () => setMenu(null),
    measure: measureLine,
    target: targetLine,
    toolbar,
    panel,
    floating,
    overlay,
    menu: menuNode,
  };
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react';
import { avalancheRisk, LEVEL_MIN_SURFACE, lateralTilt, slopeZone } from '@/core/sensors/tilt';
import { useTilt } from '@/core/sensors/useTilt';
import { Segmented } from '@/ui/Segmented';
import { Notice } from '@/ui/Notice';

type Mode = 'surface' | 'sight' | 'level';

/** Giro de la pantalla que hizo el sistema (0 vertical, 90 o 270 horizontal). */
const screenAngle = () => globalThis.screen?.orientation?.angle ?? 0;

export function InclinometerPage() {
  const { t, i18n } = useTranslation();
  const live = useTilt();
  const [mode, setMode] = useState<Mode>('surface');
  const [held, setHeld] = useState<number | null>(null);

  const lying = mode === 'level' && !!live && live.surface < LEVEL_MIN_SURFACE;
  const liveAngle = live ? (mode === 'surface' ? live.surface : mode === 'sight' ? live.sight : lying ? null : lateralTilt(live.roll, screenAngle())) : null;
  const angle = held ?? liveAngle;
  const zone = angle === null || mode === 'level' ? null : slopeZone(angle);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.inclinometer.title')}</h1>
      <Segmented<Mode>
        label={t('inclinometer.mode')}
        value={mode}
        options={[
          { value: 'surface', label: t('inclinometer.surface') },
          { value: 'sight', label: t('inclinometer.sight') },
          { value: 'level', label: t('inclinometer.level') },
        ]}
        onChange={(m) => {
          setMode(m);
          setHeld(null);
        }}
      />
      <ModeDrawing mode={mode} />
      <p className="hint" style={{ margin: 0 }}>{t(`inclinometer.${mode}Hint`)}</p>

      {lying && held === null ? (
        <p className="empty" data-testid="incl-lying">{t('inclinometer.levelLying')}</p>
      ) : angle === null ? (
        <p className="empty">{t('inclinometer.waiting')}</p>
      ) : mode === 'level' ? (
        <section className="card stack incl-card" data-testid="incl-level">
          <HorizonGauge lateral={angle} />
          <p className="incl-value" data-testid="incl-angle">
            {fmt1.format(Math.abs(angle))}°
          </p>
          <p className="incl-zone" data-testid="incl-side">
            {Math.abs(angle) < 0.5 ? t('inclinometer.levelStraight') : t(angle > 0 ? 'inclinometer.levelRight' : 'inclinometer.levelLeft')}
          </p>
          <button className="btn" type="button" aria-pressed={held !== null} onClick={() => setHeld(held === null ? liveAngle : null)}>
            {held === null ? <Lock size={18} /> : <LockOpen size={18} />} {held === null ? t('inclinometer.hold') : t('inclinometer.release')}
          </button>
        </section>
      ) : (
        <section className="card stack incl-card" data-zone={zone}>
          <SlopeGauge angle={mode === 'surface' ? angle : Math.abs(angle)} />
          <p className="incl-value" data-testid="incl-angle">
            {fmt.format(mode === 'sight' ? angle : Math.abs(angle))}°
          </p>
          <p className="incl-risk" data-testid="incl-risk" data-risk={avalancheRisk(zone!)}>
            {t('inclinometer.riskLabel')}: <strong>{t(`inclinometer.risk.${avalancheRisk(zone!)}`)}</strong>
          </p>
          <p className="incl-zone" data-testid="incl-zone">{t(`inclinometer.zone.${zone}`)}</p>
          <button className="btn" type="button" aria-pressed={held !== null} onClick={() => setHeld(held === null ? liveAngle : null)}>
            {held === null ? <Lock size={18} /> : <LockOpen size={18} />} {held === null ? t('inclinometer.hold') : t('inclinometer.release')}
          </button>
        </section>
      )}

      {mode !== 'level' && (
      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('inclinometer.zonesTitle')}</h2>
        <ul className="incl-legend">
          {(['low', 'caution', 'avalanche', 'steep', 'extreme'] as const).map((z) => (
            <li key={z} data-zone={z}>
              <span className="incl-swatch" aria-hidden />
              {t(`inclinometer.legend.${z}`)}
            </li>
          ))}
        </ul>
        <Notice id="inclinometer.disclaimer">{t('inclinometer.disclaimer')}</Notice>
      </section>
      )}
    </div>
  );
}

/**
 * Horizonte artificial: el cielo, el suelo y la línea del horizonte giran al
 * revés que el celular, así la línea queda horizontal en el mundo real; las
 * marcas fijas son las del celular (0°, ±10°, ±30°).
 */
function HorizonGauge({ lateral }: { lateral: number }) {
  const ticks = [-30, -10, 0, 10, 30];
  return (
    <svg className="incl-horizon" viewBox="-100 -100 200 200" aria-hidden>
      <defs>
        <clipPath id="horizon-clip">
          <circle r="92" />
        </clipPath>
      </defs>
      <g clipPath="url(#horizon-clip)">
        <g transform={`rotate(${-lateral})`} data-testid="horizon-line">
          <rect x="-200" y="-200" width="400" height="200" className="horizon-sky" />
          <rect x="-200" y="0" width="400" height="200" className="horizon-ground" />
          <line x1="-200" y1="0" x2="200" y2="0" className="horizon-line" />
        </g>
      </g>
      <circle r="92" className="horizon-frame" />
      {ticks.map((a) => (
        <line key={a} x1="0" y1="-92" x2="0" y2={a === 0 ? -76 : -82} transform={`rotate(${a})`} className="horizon-tick" />
      ))}
      {/* El celular: marca fija en el centro. */}
      <line x1="-46" y1="0" x2="-14" y2="0" className="horizon-device" />
      <line x1="14" y1="0" x2="46" y2="0" className="horizon-device" />
      <circle r="3.5" className="horizon-device-dot" />
    </svg>
  );
}

/** Semicírculo de 0° a 90° con las zonas de avalancha y una aguja en el ángulo actual. */
function SlopeGauge({ angle }: { angle: number }) {
  const r = 90;
  const xy = (a: number, radius = r) => {
    const rad = (a * Math.PI) / 180;
    return { x: radius * Math.cos(rad), y: -radius * Math.sin(rad) };
  };
  const arc = (from: number, to: number) => {
    const a = xy(from);
    const b = xy(to);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 0 0 ${b.x} ${b.y}`;
  };
  const needle = xy(Math.max(0, Math.min(90, angle)), r - 4);
  return (
    <svg className="incl-gauge" viewBox="-10 -100 120 110" aria-hidden>
      <path d={arc(0, 25)} className="incl-arc" data-zone="low" />
      <path d={arc(25, 30)} className="incl-arc" data-zone="caution" />
      <path d={arc(30, 45)} className="incl-arc" data-zone="avalanche" />
      <path d={arc(45, 55)} className="incl-arc" data-zone="steep" />
      <path d={arc(55, 90)} className="incl-arc" data-zone="extreme" />
      <line x1="0" y1="0" x2={needle.x} y2={needle.y} className="incl-needle" />
      <line x1="0" y1="0" x2="100" y2="0" className="incl-ground" />
      <circle r="4" className="incl-needle-hub" />
    </svg>
  );
}

/** Cómo poner el celular en cada modo (dibujo esquemático, con los colores del tema). */
function ModeDrawing({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  // Ladera de 35° que sube hacia la derecha.
  const slope = 35;
  const r = (d: number) => (d * Math.PI) / 180;
  const sx = (len: number) => 20 + len * Math.cos(r(slope));
  const sy = (len: number) => 110 - len * Math.sin(r(slope));
  return (
    <svg className="incl-drawing" viewBox="0 0 220 120" role="img" aria-label={t(`inclinometer.drawing.${mode}`)} data-testid="incl-drawing" data-mode={mode}>
      {mode !== 'level' && (
        <>
          {/* Suelo y ladera */}
          <line x1="0" y1="110" x2="220" y2="110" className="draw-ground" />
          <polygon points={`20,110 ${sx(200)},${sy(200)} ${sx(200)},110`} className="draw-slope" />
          <path d={`M 60 110 A 40 40 0 0 0 ${20 + 40 * Math.cos(r(slope))} ${110 - 40 * Math.sin(r(slope))}`} className="draw-arc" />
          <text x="66" y="104" className="draw-text">
            35°
          </text>
        </>
      )}
      {mode === 'surface' && (
        // Celular acostado sobre la ladera, con la pantalla hacia arriba.
        <g transform={`translate(${sx(110)} ${sy(110)}) rotate(${-slope})`}>
          <rect x="-28" y="-9" width="56" height="9" rx="2" className="draw-phone" />
          <rect x="-24" y="-8" width="48" height="2" className="draw-screen" />
        </g>
      )}
      {mode === 'sight' && (
        <>
          {/* Ojo abajo a la izquierda, celular a lo largo de la mira hacia la cima. */}
          <line x1="14" y1="96" x2={sx(200)} y2={sy(200) - 2} className="draw-sight" />
          <ellipse cx="12" cy="97" rx="7" ry="4" className="draw-eye" />
          <circle cx="13" cy="97" r="2" className="draw-pupil" />
          <g transform={`translate(${14 + 46 * Math.cos(r(31))} ${96 - 46 * Math.sin(r(31))}) rotate(${-31})`}>
            <rect x="-22" y="-4" width="44" height="8" rx="2" className="draw-phone" />
          </g>
        </>
      )}
      {mode === 'level' && (
        <>
          {/* Celular parado de frente, el horizonte y el giro lateral. */}
          <line x1="10" y1="64" x2="210" y2="64" className="draw-horizon" />
          <g transform="rotate(-8 110 60)">
            <rect x="86" y="14" width="48" height="92" rx="8" className="draw-phone" />
            <rect x="91" y="22" width="38" height="74" rx="3" className="draw-screen-front" />
            <line x1="95" y1="60" x2="125" y2="60" className="draw-device-mark" />
          </g>
          <path d="M 62 34 A 56 56 0 0 0 62 92" className="draw-arrow" markerEnd="url(#incl-arrow)" />
          <path d="M 158 92 A 56 56 0 0 0 158 34" className="draw-arrow" markerEnd="url(#incl-arrow)" />
          <defs>
            <marker id="incl-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="draw-arrow-head" />
            </marker>
          </defs>
        </>
      )}
    </svg>
  );
}

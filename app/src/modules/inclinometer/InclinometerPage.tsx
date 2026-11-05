import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react';
import { avalancheRisk, slopeZone } from '@/core/sensors/tilt';
import { useTilt } from '@/core/sensors/useTilt';
import { Segmented } from '@/ui/Segmented';

type Mode = 'surface' | 'sight';

export function InclinometerPage() {
  const { t, i18n } = useTranslation();
  const live = useTilt();
  const [mode, setMode] = useState<Mode>('surface');
  const [held, setHeld] = useState<number | null>(null);

  const liveAngle = live ? (mode === 'surface' ? live.surface : live.sight) : null;
  const angle = held ?? liveAngle;
  const zone = angle === null ? null : slopeZone(angle);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.inclinometer.title')}</h1>
      <Segmented<Mode>
        label={t('inclinometer.mode')}
        value={mode}
        options={[
          { value: 'surface', label: t('inclinometer.surface') },
          { value: 'sight', label: t('inclinometer.sight') },
        ]}
        onChange={(m) => {
          setMode(m);
          setHeld(null);
        }}
      />
      <p className="hint" style={{ margin: 0 }}>{t(`inclinometer.${mode}Hint`)}</p>

      {angle === null ? (
        <p className="empty">{t('inclinometer.waiting')}</p>
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
        <p className="hint" style={{ margin: 0 }}>{t('inclinometer.disclaimer')}</p>
      </section>
    </div>
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

import { useTranslation } from 'react-i18next';

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const LETTERS = [
  { angle: 0, key: 'N' },
  { angle: 90, key: 'E' },
  { angle: 180, key: 'S' },
  { angle: 270, key: 'W' },
] as const;

/**
 * Rosa de los vientos que gira para que el norte quede donde está el norte real.
 * La línea de fe (arriba) marca hacia dónde apunta el celular. `target` es el rumbo
 * a un waypoint, en la misma referencia que `heading`.
 */
export function CompassRose({ heading, target }: { heading: number; target?: number | null }) {
  const { t } = useTranslation();
  return (
    <svg className="compass-rose" viewBox="-110 -110 220 220" role="img" aria-label={t('compass.roseLabel')}>
      <g style={{ transform: `rotate(${-heading}deg)` }}>
        <circle r="100" className="rose-face" />
        {TICKS.map((a) => (
          <line
            key={a}
            x1="0"
            y1={-100}
            x2="0"
            y2={a % 90 === 0 ? -82 : a % 30 === 0 ? -88 : -94}
            className={a % 30 === 0 ? 'rose-tick-major' : 'rose-tick'}
            transform={`rotate(${a})`}
          />
        ))}
        {LETTERS.map(({ angle, key }) => (
          <text key={key} className={key === 'N' ? 'rose-letter rose-north' : 'rose-letter'} transform={`rotate(${angle}) translate(0 -66) rotate(${-angle + heading})`} textAnchor="middle" dominantBaseline="central">
            {t(`geo.cardinal.${key}`)}
          </text>
        ))}
        {target != null && (
          <g transform={`rotate(${target})`} data-testid="rose-target">
            <path d="M0 -100 L9 -78 L-9 -78 Z" className="rose-target" />
          </g>
        )}
      </g>
      <path d="M0 -110 L7 -96 L-7 -96 Z" className="rose-lubber" />
      <circle r="3" className="rose-center" />
    </svg>
  );
}

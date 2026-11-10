import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CARDINALS, normalizeDeg } from '@/core/geo/geo';
import type { Place } from '@/modules/astronomy/sky';
import { sunPathAzimuths } from './sun';

const SIZE = 220;
const C = SIZE / 2;
const R = 92;

const rad = (d: number) => (d * Math.PI) / 180;
/** Punto del dial para un rumbo (0 = arriba/norte, sentido horario). */
const at = (deg: number, r: number) => ({ x: C + r * Math.sin(rad(deg)), y: C - r * Math.cos(rad(deg)) });

/**
 * Dial para elegir hacia dónde mira el frente del cantero: se toca o se arrastra
 * sobre el círculo (norte arriba). Dibuja el cantero a escala con el frente
 * marcado y, si hay lugar, el arco que recorre el sol hoy. También se maneja con
 * el teclado (flechas, ±1°; con Mayús ±10°).
 */
export function BearingDial({
  value,
  onChange,
  widthCm,
  lengthCm,
  place,
}: {
  value: number | null;
  onChange: (deg: number) => void;
  widthCm: number;
  lengthCm: number;
  place: Place | null;
}) {
  const { t } = useTranslation();
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  function fromPointer(e: React.PointerEvent) {
    const box = svg.current!.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) < 8) return;
    onChange(Math.round(normalizeDeg((Math.atan2(dx, -dy) * 180) / Math.PI)) % 360);
  }

  const bearing = value ?? 0;
  // Cantero a escala dentro del círculo: el largo va hacia el frente.
  const k = Math.min(1, (R * 1.5) / Math.max(widthCm, lengthCm, 1));
  const hw = Math.max(6, (widthCm * k) / 2 / 1.5);
  const hl = Math.max(6, (lengthCm * k) / 2 / 1.5);
  const sun = place ? sunPathAzimuths(place, new Date()) : [];
  const sunPts = sun.map((az) => at(az, R + 11));

  return (
    <svg
      ref={svg}
      className="bearing-dial"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="slider"
      tabIndex={0}
      aria-label={t('garden.sun.dialLabel')}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? t('garden.sun.dialNone') : `${value}°`}
      data-testid="bearing-dial"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.round(normalizeDeg(bearing + step)) % 360);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.round(normalizeDeg(bearing - step)) % 360);
        else return;
        e.preventDefault();
      }}
    >
      <circle cx={C} cy={C} r={R} className="bd-ring" />
      {Array.from({ length: 36 }, (_, i) => i * 10).map((d) => {
        const a = at(d, R);
        const b = at(d, R - (d % 90 === 0 ? 10 : d % 30 === 0 ? 7 : 4));
        return <line key={d} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="bd-tick" />;
      })}
      {CARDINALS.filter((_, i) => i % 2 === 0).map((c, i) => {
        const p = at(i * 90, R - 20);
        return (
          <text key={c} x={p.x} y={p.y + 5} textAnchor="middle" className="bd-card">
            {t(`geo.cardinal.${c}`)}
          </text>
        );
      })}
      {sunPts.length > 1 && <polyline points={sunPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} className="bd-sun" fill="none" />}
      {value !== null && (
        <g transform={`rotate(${bearing} ${C} ${C})`}>
          <rect x={C - hw} y={C - hl} width={hw * 2} height={hl * 2} rx={3} className="bd-bed" />
          <path d={`M${C - 12} ${C - hl - 2}L${C} ${C - hl - 16}L${C + 12} ${C - hl - 2}Z`} className="bd-front" />
        </g>
      )}
      {value !== null && <circle cx={at(bearing, R).x} cy={at(bearing, R).y} r={8} className="bd-knob" />}
    </svg>
  );
}

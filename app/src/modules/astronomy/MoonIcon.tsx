/**
 * Luna con la parte iluminada según la fase. En el hemisferio norte la creciente
 * se ilumina a la derecha; en el sur se ve al revés (la "C" de creciente es la
 * del sur).
 */
export function MoonIcon({ phaseAngle, southern, size = 96 }: { phaseAngle: number; southern: boolean; size?: number }) {
  const r = 40;
  const p = (((phaseAngle % 360) + 360) % 360) * (Math.PI / 180);
  const cos = Math.cos(p);
  const rx = Math.abs(cos) * r;
  // Limbo iluminado (semicírculo derecho) y vuelta por el terminador: hacia afuera en creciente, hacia adentro en gibosa.
  const lit = `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${rx} ${r} 0 0 ${cos > 0 ? 0 : 1} 0 ${-r}Z`;
  const waxing = phaseAngle % 360 < 180;
  const mirrored = !waxing !== southern;
  return (
    <svg width={size} height={size} viewBox="-44 -44 88 88" aria-hidden className="moon-icon">
      <circle r={r} className="moon-dark" />
      <path d={lit} className="moon-lit" transform={mirrored ? 'scale(-1 1)' : undefined} />
    </svg>
  );
}

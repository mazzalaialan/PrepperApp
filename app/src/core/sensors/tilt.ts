/**
 * Inclinación a partir de la gravedad que mide el acelerómetro
 * (`devicemotion.accelerationIncludingGravity`, ejes del dispositivo: x a la
 * derecha, y hacia arriba de la pantalla, z saliendo de la pantalla; acostado
 * boca arriba, z ≈ +9,8).
 */

const deg = (r: number) => (r * 180) / Math.PI;

export interface Tilt {
  /** Ángulo de la pantalla respecto de la horizontal (0 = acostado, 90 = parado): apoyado sobre la pendiente. */
  surface: number;
  /** Elevación del borde superior sobre el horizonte (−90 a 90): apuntando a lo largo del celular. */
  sight: number;
}

export function tiltFromGravity(x: number, y: number, z: number): Tilt | null {
  const g = Math.hypot(x, y, z);
  if (g < 1) return null; // en caída libre o sin datos no hay referencia
  return {
    surface: deg(Math.acos(Math.min(1, Math.abs(z) / g))),
    sight: deg(Math.asin(Math.max(-1, Math.min(1, y / g)))),
  };
}

export type SlopeZone = 'low' | 'caution' | 'avalanche' | 'steep';

/**
 * Zonas orientativas para avalanchas: la gran mayoría se desprende entre 30° y
 * 45°; por encima la nieve suele descargarse en pequeñas coladas; por debajo
 * de 25° es raro que se desprenda (pero puede llegar una de más arriba).
 */
export function slopeZone(angle: number): SlopeZone {
  const a = Math.abs(angle);
  if (a < 25) return 'low';
  if (a < 30) return 'caution';
  if (a <= 45) return 'avalanche';
  return 'steep';
}

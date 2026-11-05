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
  /**
   * Giro del celular parado sobre el eje que sale de la pantalla (−180 a 180):
   * 0 = derecho; positivo = girado en el sentido de las agujas del reloj
   * (borde derecho más abajo).
   */
  roll: number;
}

export function tiltFromGravity(x: number, y: number, z: number): Tilt | null {
  const g = Math.hypot(x, y, z);
  if (g < 1) return null; // en caída libre o sin datos no hay referencia
  return {
    surface: deg(Math.acos(Math.min(1, Math.abs(z) / g))),
    sight: deg(Math.asin(Math.max(-1, Math.min(1, y / g)))),
    roll: deg(Math.atan2(-x, y)),
  };
}

/** Por debajo de esta inclinación el celular está casi acostado y el giro lateral no se puede medir bien. */
export const LEVEL_MIN_SURFACE = 35;

/**
 * Inclinación lateral respecto de la pantalla (−180 a 180): el giro del
 * celular más el giro de la pantalla (si el sistema la rotó a horizontal, el
 * "derecho" pasa a ser ese).
 */
export function lateralTilt(roll: number, screenAngle = 0): number {
  const a = (((roll + screenAngle) % 360) + 540) % 360 - 180;
  return Object.is(a, -0) ? 0 : a;
}

export type SlopeZone = 'low' | 'caution' | 'avalanche' | 'steep' | 'extreme';

/**
 * Zonas orientativas para avalanchas: la gran mayoría se desprende entre 30° y
 * 45°; entre 45° y 55° las placas son menos frecuentes y la nieve suele
 * descargarse en coladas; por encima de 55° es pared o roca y la nieve casi no
 * se acumula; por debajo de 25° es raro que se desprenda (pero puede llegar
 * una de más arriba). Como las escalas habituales (CalTopo, swisstopo), con
 * los cortes en 25, 30, 45 y 55°.
 */
export function slopeZone(angle: number): SlopeZone {
  const a = Math.abs(angle);
  if (a < 25) return 'low';
  if (a < 30) return 'caution';
  if (a <= 45) return 'avalanche';
  if (a <= 55) return 'steep';
  return 'extreme';
}

export type AvalancheRisk = 'low' | 'moderate' | 'high';

/**
 * Riesgo por la pendiente del terreno. Nunca baja al aumentar la pendiente:
 * por encima de 45° las placas grandes son menos frecuentes, pero mostrar
 * "menos riesgo" en terreno más empinado sería una falsa seguridad.
 */
export function avalancheRisk(zone: SlopeZone): AvalancheRisk {
  return zone === 'low' ? 'low' : zone === 'caution' ? 'moderate' : 'high';
}

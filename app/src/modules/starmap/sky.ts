import { Body, Equator, MakeTime, Observer, SiderealTime } from 'astronomy-engine';

/**
 * Posiciones en el cielo local. Las estrellas vienen en coordenadas J2000; la
 * precesión hasta hoy (~0,4°) no se nota en una carta para orientarse.
 * Vectores en el marco local ENU: x = este, y = norte, z = arriba (cenit).
 */

export type Vec3 = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface Horizontal {
  /** Acimut verdadero, grados desde el norte hacia el este. */
  az: number;
  /** Altura sobre el horizonte, grados. */
  alt: number;
}

/** Tiempo sidéreo local en grados. */
export function localSiderealDeg(date: Date, lon: number): number {
  return (((SiderealTime(MakeTime(date)) * 15 + lon) % 360) + 360) % 360;
}

/** Ecuatoriales (AR y declinación en grados) → vector ENU unitario. */
export function equatorialToVector(raDeg: number, decDeg: number, lstDeg: number, latDeg: number): Vec3 {
  const ha = rad(lstDeg - raDeg);
  const dec = rad(decDeg);
  const lat = rad(latDeg);
  // Fórmulas estándar de altura y acimut, escritas directamente como vector.
  const east = -Math.cos(dec) * Math.sin(ha);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(ha) * Math.sin(lat);
  const up = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(ha) * Math.cos(lat);
  return [east, north, up];
}

export function vectorToHorizontal([e, n, u]: Vec3): Horizontal {
  return { az: ((deg(Math.atan2(e, n)) % 360) + 360) % 360, alt: deg(Math.asin(Math.max(-1, Math.min(1, u)))) };
}

export function horizontalToVector({ az, alt }: Horizontal): Vec3 {
  return [Math.cos(rad(alt)) * Math.sin(rad(az)), Math.cos(rad(alt)) * Math.cos(rad(az)), Math.sin(rad(alt))];
}

export type PlanetId = 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';

const BODIES: Record<PlanetId, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
};

export const PLANETS = Object.keys(BODIES) as PlanetId[];

/** Sol, Luna y planetas a simple vista, en coordenadas J2000 (como las estrellas). */
export function planetPositions(date: Date, lat: number, lon: number): { id: PlanetId; ra: number; dec: number }[] {
  const observer = new Observer(lat, lon, 0);
  return PLANETS.map((id) => {
    // ofdate = false: mismo marco J2000 que el catálogo; aberración incluida.
    const eq = Equator(BODIES[id], date, observer, false, true);
    return { id, ra: eq.ra * 15, dec: eq.dec };
  });
}

/**
 * Polo celeste visible: el sur en el hemisferio sur, el norte en el norte.
 * Está a una altura igual a la latitud, sobre el punto cardinal correspondiente.
 */
export function visiblePole(lat: number): { hemisphere: 'south' | 'north'; pole: Horizontal } {
  return lat < 0
    ? { hemisphere: 'south', pole: { az: 180, alt: -lat } }
    : { hemisphere: 'north', pole: { az: 0, alt: lat } };
}

/** Estrellas de las guías (número Hipparcos). */
export const GUIDE_STARS = {
  // Cruz del Sur: el eje largo, de Gacrux a Acrux, apunta al polo sur celeste (~4,5 veces su largo).
  gacrux: 61084,
  acrux: 60718,
  // Punteros: la mediatriz entre Alfa y Beta Centauri también cruza el polo.
  alphaCen: 71683,
  betaCen: 68702,
  // Osa Mayor: de Merak a Dubhe, unas 5 veces, se llega a la Polar.
  merak: 53910,
  dubhe: 54061,
  polaris: 11767,
} as const;

// ---------- Proyecciones ----------

/** Cámara: hacia dónde mira y qué es "derecha" y "arriba" en la pantalla, en ENU. */
export interface Camera {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  /** Campo de visión vertical, grados. */
  fov: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Cámara que mira a un acimut y altura sin girar (para PC, arrastrando). */
export function cameraLookingAt(view: Horizontal, fov: number): Camera {
  const forward = horizontalToVector(view);
  // Mirando al cenit, "arriba" en pantalla queda indefinido: se usa la dirección del acimut.
  const worldUp: Vec3 = Math.abs(view.alt) > 89 ? horizontalToVector({ az: view.az, alt: 0 }) : [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
  return { forward, right, up: cross(right, forward), fov };
}

/**
 * Cámara del celular a partir de la orientación del dispositivo (W3C:
 * R = Rz(α)·Rx(β)·Ry(γ), norte magnético) y la declinación. La cámara trasera
 * mira hacia −z del dispositivo; `screenAngle` es la rotación de la pantalla.
 */
export function cameraFromDevice(alpha: number, beta: number, gamma: number, declination: number, screenAngle: number, fov: number): Camera {
  const [sA, cA] = [Math.sin(rad(alpha)), Math.cos(rad(alpha))];
  const [sB, cB] = [Math.sin(rad(beta)), Math.cos(rad(beta))];
  const [sG, cG] = [Math.sin(rad(gamma)), Math.cos(rad(gamma))];
  // Columnas de R: ejes del dispositivo expresados en el marco magnético.
  const xAxis: Vec3 = [cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG];
  const yAxis: Vec3 = [-sA * cB, cA * cB, sB];
  const zAxis: Vec3 = [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG];
  // Magnético → verdadero: el acimut verdadero es el magnético más la declinación.
  const d = rad(declination);
  const toTrue = (v: Vec3): Vec3 => [v[0] * Math.cos(d) + v[1] * Math.sin(d), -v[0] * Math.sin(d) + v[1] * Math.cos(d), v[2]];
  const [x, y, z] = [toTrue(xAxis), toTrue(yAxis), toTrue(zAxis)];
  // Ejes de la pantalla (con el celular girado a horizontal, la "derecha" es otro eje del aparato).
  const t = rad(screenAngle);
  const right: Vec3 = [x[0] * Math.cos(t) - y[0] * Math.sin(t), x[1] * Math.cos(t) - y[1] * Math.sin(t), x[2] * Math.cos(t) - y[2] * Math.sin(t)];
  const up: Vec3 = [x[0] * Math.sin(t) + y[0] * Math.cos(t), x[1] * Math.sin(t) + y[1] * Math.cos(t), x[2] * Math.sin(t) + y[2] * Math.cos(t)];
  return { forward: [-z[0], -z[1], -z[2]], right, up, fov };
}

/** Proyección en perspectiva; `null` si queda detrás de la cámara. Devuelve píxeles desde el centro. */
export function projectCamera(v: Vec3, cam: Camera, height: number): { x: number; y: number } | null {
  const depth = dot(v, cam.forward);
  if (depth <= 0.01) return null;
  const f = height / 2 / Math.tan(rad(cam.fov / 2));
  return { x: (f * dot(v, cam.right)) / depth, y: (-f * dot(v, cam.up)) / depth };
}

/** Dirección en pantalla (ángulo, rad) hacia un punto fuera de cuadro. */
export function offscreenDirection(v: Vec3, cam: Camera): number {
  return Math.atan2(-dot(v, cam.up), dot(v, cam.right));
}

/**
 * Cúpula (planisferio): proyección estereográfica desde el cenit; el horizonte
 * es el círculo de radio `radius`. `top` es el acimut que queda arriba. Mirando
 * hacia arriba, el este queda a la izquierda del norte (como en las cartas del cielo).
 */
export function projectDome(h: Horizontal, radius: number, top: number): { x: number; y: number } | null {
  if (h.alt < -2) return null;
  const r = radius * Math.tan(rad(90 - h.alt) / 2);
  const a = rad(h.az - top);
  return { x: -r * Math.sin(a), y: -r * Math.cos(a) };
}

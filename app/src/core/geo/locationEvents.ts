/**
 * Aviso de que hay una ubicación nueva (un punto del GPS, un lugar elegido o coordenadas escritas). Sirve para que cosas como la
 * detección del país reaccionen al evento, sin pedir el GPS por su cuenta ni usar un temporizador: si la app no se mueve ni
 * elige un lugar, no gasta nada.
 */
type Listener = (lat: number, lon: number) => void;

const listeners = new Set<Listener>();

export function reportLocation(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  for (const fn of listeners) fn(lat, lon);
}

/** Se suscribe a las ubicaciones nuevas; devuelve cómo desuscribirse. */
export function onLocation(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

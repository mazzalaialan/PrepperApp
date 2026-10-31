import { create } from 'zustand';

/**
 * Detección de capacidades del dispositivo (ver ARQUITECTURA §2.1).
 * Se detecta cada capacidad, nunca "es PC" o "es celular".
 */
export type Capability =
  | 'geolocation'
  | 'orientation'
  | 'motion'
  | 'camera'
  | 'barcode'
  | 'notifications'
  | 'periodicSync'
  | 'push'
  | 'webauthn'
  | 'opfs'
  | 'shareFiles'
  | 'serviceWorker';

export const CAPABILITIES: Capability[] = [
  'geolocation',
  'orientation',
  'motion',
  'camera',
  'barcode',
  'notifications',
  'periodicSync',
  'push',
  'webauthn',
  'opfs',
  'shareFiles',
  'serviceWorker',
];

export type CapabilityMap = Record<Capability, boolean>;

/**
 * Los navegadores de escritorio exponen los eventos de orientación aunque no
 * haya sensor; solo se considera disponible si llega una lectura real.
 */
function probeEvent(event: 'deviceorientationabsolute' | 'devicemotion', timeoutMs = 1500): Promise<boolean> {
  if (!(`on${event}` in window)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      window.removeEventListener(event, handler);
      clearTimeout(timer);
      resolve(value);
    };
    const handler = (e: Event) => {
      const hasData =
        e instanceof DeviceOrientationEvent ? e.alpha !== null : (e as DeviceMotionEvent).accelerationIncludingGravity?.x != null;
      done(hasData);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    window.addEventListener(event, handler);
  });
}

async function hasCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    return devices?.some((d) => d.kind === 'videoinput') ?? false;
  } catch {
    return false;
  }
}

function canShareFiles(): boolean {
  try {
    return navigator.canShare?.({ files: [new File([''], 'x.vikarg')] }) ?? false;
  } catch {
    return false;
  }
}

export async function detectCapabilities(): Promise<CapabilityMap> {
  const [orientation, motion, camera] = await Promise.all([
    probeEvent('deviceorientationabsolute'),
    probeEvent('devicemotion'),
    hasCamera(),
  ]);
  return {
    geolocation: 'geolocation' in navigator,
    orientation,
    motion,
    camera,
    barcode: 'BarcodeDetector' in window,
    notifications: 'Notification' in window,
    periodicSync: 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype,
    push: 'serviceWorker' in navigator && 'PushManager' in window,
    webauthn: 'PublicKeyCredential' in window,
    opfs: typeof navigator.storage?.getDirectory === 'function',
    shareFiles: canShareFiles(),
    serviceWorker: 'serviceWorker' in navigator,
  };
}

interface CapabilitiesState {
  caps: CapabilityMap | null;
  detect: () => Promise<void>;
}

export const useCapabilities = create<CapabilitiesState>((set) => ({
  caps: null,
  async detect() {
    set({ caps: await detectCapabilities() });
  },
}));

/**
 * Una capacidad puntual. Mientras dura la detección (las de sensores tardan
 * hasta 1,5 s) responde lo que se sabe al instante: el GPS existe si el
 * navegador lo expone; el resto se asume ausente hasta confirmarlo.
 */
export function useCapability(name: Capability): boolean {
  return useCapabilities((s) => s.caps?.[name] ?? (name === 'geolocation' && 'geolocation' in navigator));
}

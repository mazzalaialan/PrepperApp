import type { FirstAidEnv } from '@/core/settings/settings';

/** Texto en los dos idiomas de la app (la guía es contenido, no interfaz: vive junto). */
export interface L {
  es: string;
  en: string;
}

/** A quién llamar desde un paso (número en `CALLS`). */
export type CallKey = 'emergency' | 'same' | 'fire' | 'poison' | 'poisonKids' | 'burns';

export interface Step {
  text: L;
  /** Solo en ese entorno; sin `env`, vale para los dos. */
  env?: FirstAidEnv;
  /** "No hacer": se muestra resaltado. */
  dont?: boolean;
}

export interface Option {
  label: L;
  /** Otro paso del mismo tema, `topic:<id>` para pasar a otra guía o `topic:<id>#<paso>` a un paso de otra. */
  next: string;
}

export interface GuideNode {
  title: L;
  steps: Step[];
  /** Botones para llamar (en zona agreste se suma "Mi ubicación" para dar las coordenadas). */
  calls?: CallKey[];
  question?: L;
  options?: Option[];
}

export interface Topic {
  id: string;
  title: L;
  /** Para encontrarlo buscando ("yarará", "infarto"…). */
  keywords: L;
  start: string;
  nodes: Record<string, GuideNode>;
}

export const CALLS: Record<CallKey, string> = {
  emergency: '911',
  same: '107',
  fire: '100',
  poison: '0800-333-0160',
  poisonKids: '0800-444-8694',
  burns: '011 4923-4082',
};

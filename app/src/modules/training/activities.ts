/**
 * Actividades del Entrenamiento: las que se graban con el GPS (a pie, remo,
 * ciclismo) y las que se hacen bajo techo (cinta, elíptica, escalador), que se
 * cargan a mano o con el cronómetro.
 */

import type { WorkoutKind } from '@/core/model/types';

export type ActivityGroup = 'foot' | 'rowing' | 'cycling' | 'indoor';

export const ACTIVITY_KINDS = [
  'walk',
  'run',
  'trek',
  'kayak',
  'canoe',
  'rowboat',
  'sup',
  'rafting',
  'roadBike',
  'mtb',
  'gravel',
  'cityBike',
  'ebike',
  'treadmill',
  'elliptical',
  'stairClimber',
] as const satisfies readonly WorkoutKind[];
export type ActivityKind = WorkoutKind;

export interface ActivityDef {
  kind: ActivityKind;
  group: ActivityGroup;
  /** Se graba con el GPS (mapa, distancia y desnivel); si no, se carga a mano. */
  gps: boolean;
  /** Cómo se mide el esfuerzo: ritmo (min/km) a pie, velocidad (km/h) en bici y remo. */
  measure: 'pace' | 'speed';
}

export const ACTIVITIES: Record<ActivityKind, ActivityDef> = {
  walk: { kind: 'walk', group: 'foot', gps: true, measure: 'pace' },
  run: { kind: 'run', group: 'foot', gps: true, measure: 'pace' },
  trek: { kind: 'trek', group: 'foot', gps: true, measure: 'pace' },
  kayak: { kind: 'kayak', group: 'rowing', gps: true, measure: 'speed' },
  canoe: { kind: 'canoe', group: 'rowing', gps: true, measure: 'speed' },
  rowboat: { kind: 'rowboat', group: 'rowing', gps: true, measure: 'speed' },
  sup: { kind: 'sup', group: 'rowing', gps: true, measure: 'speed' },
  rafting: { kind: 'rafting', group: 'rowing', gps: true, measure: 'speed' },
  roadBike: { kind: 'roadBike', group: 'cycling', gps: true, measure: 'speed' },
  mtb: { kind: 'mtb', group: 'cycling', gps: true, measure: 'speed' },
  gravel: { kind: 'gravel', group: 'cycling', gps: true, measure: 'speed' },
  cityBike: { kind: 'cityBike', group: 'cycling', gps: true, measure: 'speed' },
  ebike: { kind: 'ebike', group: 'cycling', gps: true, measure: 'speed' },
  treadmill: { kind: 'treadmill', group: 'indoor', gps: false, measure: 'pace' },
  elliptical: { kind: 'elliptical', group: 'indoor', gps: false, measure: 'speed' },
  stairClimber: { kind: 'stairClimber', group: 'indoor', gps: false, measure: 'speed' },
};

export const GROUPS: ActivityGroup[] = ['foot', 'rowing', 'cycling', 'indoor'];

export const kindsOf = (group: ActivityGroup): ActivityKind[] => ACTIVITY_KINDS.filter((k) => ACTIVITIES[k].group === group);

export const isActivityKind = (v: unknown): v is ActivityKind => typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);

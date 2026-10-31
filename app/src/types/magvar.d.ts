declare module 'magvar' {
  /** Declinación magnética en grados (este positivo). Altitud en km; fecha como Date o año decimal. */
  export function magvar(latitude: number, longitude: number, altitudeKm?: number, when?: Date | number): number;
  export const MODEL_EPOCH: number;
  export const MODEL_VALID_UNTIL: number;
}

/**
 * Altura de la planta adulta, en cm, para saber quién le hace sombra a quién.
 * Son valores generales de huerta (no de una variedad): los cultivos que se
 * enredan (arveja, chaucha, pepino) cuentan con su soporte; los que se
 * arrastran (batata, melón, sandía, zapallo) son bajos y no tapan, aunque
 * ocupen lugar.
 */
export const CROP_HEIGHT_CM: Record<string, number> = {
  acelga: 50, achicoria: 40, ajo: 50, albahaca: 40, apio: 60, arveja: 150, batata: 30, berenjena: 90,
  brocoli: 70, coliflor: 60, cebolla: 50, verdeo: 45, chaucha: 180, choclo: 220, cilantro: 50,
  escarola: 30, esparrago: 150, espinaca: 25, frutilla: 20, haba: 120, hinojo: 120, lechuga: 25,
  melon: 30, papa: 60, pepino: 180, perejil: 35, pimiento: 70, puerro: 70, rabanito: 20,
  radicheta: 30, remolacha: 40, repollo: 45, rucula: 30, sandia: 30, tomate: 180, zanahoria: 40,
  zapallo: 40, zapallito: 60,
};

/** Altura de un cultivo (50 cm si no está en la tabla). */
export function cropHeightCm(id: string): number {
  return CROP_HEIGHT_CM[id] ?? 50;
}

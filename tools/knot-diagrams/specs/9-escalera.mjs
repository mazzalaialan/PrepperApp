import { A } from '../helpers.mjs';

/**
 * Escalera de cuerda con travesaños de madera (FM 5-125, 2-60 «Fiber-rope ladder with wood rungs», dominio público):
 * «Notch the ends of each rung and fasten the rung to the fiber-rope upright with a clove hitch».
 * Cada travesaño lleva una muesca (cintura) en cada punta; la cuerda vertical (la «montante») baja de una pieza, da el
 * ballestrinque en la muesca y sigue hacia el travesaño de abajo, o sea que el ballestrinque se hace «en seno» sobre la
 * cuerda continua. Es el ballestrinque verificado (BAAB, ver refs/ballestrinque.json y specs/5-cotes.mjs) girado 90°.
 */
const LX = 100, RX = 300; // las dos cuerdas verticales
const NECK = 10; // medio grosor de la muesca
const BODY = 15; // medio grosor del travesaño

/** Travesaño horizontal en y, con una cintura (muesca) centrada en cada cuerda. */
const rung = (y) => {
  const [x0, x1] = [48, 352];
  const cut = (x, dir) => {
    // Baja a la cintura, la recorre y vuelve a subir (dir = 1 de izquierda a derecha, -1 al revés), por la cara de arriba.
    const w = 30, s = 8;
    return dir > 0 ? `L${x - w - s} ${y - BODY} L${x - w} ${y - NECK} L${x + w} ${y - NECK} L${x + w + s} ${y - BODY}` : `L${x + w + s} ${y + BODY} L${x + w} ${y + NECK} L${x - w} ${y + NECK} L${x - w - s} ${y + BODY}`;
  };
  const d = `M${x0 + 8} ${y - BODY} ${cut(LX, 1)} ${cut(RX, 1)} L${x1 - 8} ${y - BODY} Q${x1} ${y - BODY} ${x1} ${y - BODY + 8} L${x1} ${y + BODY - 8} Q${x1} ${y + BODY} ${x1 - 8} ${y + BODY} ${cut(RX, -1)} ${cut(LX, -1)} L${x0 + 8} ${y + BODY} Q${x0} ${y + BODY} ${x0} ${y + BODY - 8} L${x0} ${y - BODY + 8} Q${x0} ${y - BODY} ${x0 + 8} ${y - BODY}z`;
  return { kind: 'path', d, fill: '#a07c55', stroke: '#6b5136' };
};
/** Marca en la cuerda (rayita transversal). */
const mark = (x, y) => ({ kind: 'path', d: `M${x - 14} ${y - 2}h28v4h-28z`, fill: '#c0392b', stroke: '#7d2218' });

// Ballestrinque de specs/5-cotes.mjs (palo vertical, firme que entra por la izquierda y chicote que sale por la derecha),
// con el centro en (0, 0). Se lo pasa a un travesaño horizontal intercambiando los ejes: el firme llega desde arriba
// y el chicote sale hacia abajo. Pasa por delante z = 1/2, por detrás z = -1.
const CR = 21, CH = 52; // radio de las vueltas alrededor de la muesca y largo que ocupan sobre el travesaño
const f = (a) => (a * CH) / 100;
const UP = [[-CR, 0, 1], [0, f(-25), 1], [CR, f(-50), 1], [CR + 7, f(-54)], [0, f(-62), -1], [-CR, f(-58), 0]];
const DOWN = [[0, f(-4), 2], [CR, f(50), 2], [CR + 7, f(54)], [0, f(58), -1], [-CR, f(55), 0]];
const TUCK = [[0, f(40), 1], [45, f(18), 1]];
/** Ballestrinque de la cuerda en x sobre el travesaño de altura y: entra desde arriba, sale hacia abajo. */
const clove = (x, y) => [...UP, ...DOWN, ...TUCK].map(([px, py, z]) => [x + py, y + px, ...(z === undefined ? [] : [z])]);
/** Cuerda vertical en x con un ballestrinque en cada altura de `ys`; la parte de arriba entra desde afuera del cuadro. */
const rope = (x, ys) => {
  const out = [[x, -20], [x, ys[0] - CR - 40]];
  ys.forEach((y, i) => {
    out.push(...clove(x, y));
    out.push([x + 2, y + 62]);
    if (i < ys.length - 1) out.push([x, ys[i + 1] - CR - 22]);
  });
  out.push([x, ys[ys.length - 1] + 200]);
  return out;
};
/** Cuerda sin ballestrinque (todavía sin atar): pasa por detrás del travesaño. */
const plain = (x, ys = []) => [[x, -20], ...ys.flatMap((y) => [[x, y - 36], [x, y - 12, -1], [x, y + 12, -1], [x, y + 36]]), [x, 420]];
const R = (x, path) => ({ ...A, path, end: false });

export default {
  escalera: [
    // 1) Los travesaños ya tienen sus muescas; las dos cuerdas se marcan a la misma distancia (la flecha).
    {
      height: 380,
      poles: [rung(90), mark(LX, 210), mark(RX, 210), mark(LX, 330), mark(RX, 330)],
      ropes: [R(LX, plain(LX, [90])), R(RX, plain(RX, [90]))],
      arrows: [[[LX + 36, 130], [LX + 36, 200]], [[RX - 36, 130], [RX - 36, 200]], [[LX + 36, 250], [LX + 36, 320]], [[RX - 36, 250], [RX - 36, 320]]],
    },
    // 2) Ballestrinque en la muesca de una punta, en la primera marca.
    { height: 340, poles: [rung(110)], ropes: [R(LX, rope(LX, [110])), R(RX, plain(RX, [110]))] },
    // 3) Lo mismo con la otra cuerda, en la otra punta y a la misma altura.
    { height: 340, poles: [rung(110)], ropes: [R(LX, rope(LX, [110])), R(RX, rope(RX, [110]))] },
    // 4) Repetido escalón por escalón.
    { height: 400, poles: [rung(70), rung(190), rung(310)], ropes: [R(LX, rope(LX, [70, 190, 310])), R(RX, rope(RX, [70, 190, 310]))], arrows: [[[200, 350], [200, 385]]] },
  ],
};

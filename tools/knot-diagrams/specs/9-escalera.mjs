import { A, coilAlong, coilV } from '../helpers.mjs';

// Dos cuerdas verticales (x = 110 y 290) y travesaños de madera horizontales.
const rung = (y) => ({ x: 60, y: y - 11, w: 280, h: 22, rx: 9 });
// Muescas en las puntas del travesaño, donde va cada ballestrinque.
const notch = (x, y) => ({ x: x - 26, y: y - 13, w: 52, h: 26, rx: 4, fill: '#7d5f40', stroke: '#5b4630' });
const LX = 110, RX = 290;

// Ballestrinque del palo vertical (5-cotes) girado 90°: la cuerda baja y da dos vueltas al travesaño.
const CLOVE = [...coilV({ x: 195, y: 95, n: 2, pitch: 55, r: 34 }), [150, 205], [178, 178, 0.5], [214, 160, 0.5], [245, 156]];
const S = 0.72;
const clove = (x, y, backup) => [
  ...CLOVE.map(([px, py, z]) => [x + (py - 150) * S, y + (px - 195) * S, ...(z === undefined ? [] : [z])]),
  [x + 4, y + 48],
  ...(backup ? coilAlong([x + 4, y + 54], [x + 2, y + 80], 1, 12).map(([px, py, z]) => [px, py, z * 2]) : []),
];
const rope = (x, ys, backupUpTo = -1) => {
  const out = [[x - 40, -20]];
  ys.forEach((y, i) => out.push([x - 18, y - 55], ...clove(x, y, i <= backupUpTo), [x + 2, y + 78]));
  out.push([x, 400]);
  return out;
};
const plain = (x) => [[x, -20], [x, 170], [x, 360]];

export default {
  escalera: [
    { height: 340, poles: [rung(250)], ropes: [{ ...A, path: plain(LX), end: false }, { ...A, path: plain(RX), end: false }], arrows: [[[60, 90], [95, 90]], [[340, 90], [305, 90]], [[60, 180], [95, 180]], [[340, 180], [305, 180]]] },
    { height: 340, poles: [rung(110)], ropes: [{ ...A, path: rope(LX, [110]), end: false }, { ...A, path: plain(RX), end: false }] },
    { height: 340, poles: [rung(110), notch(LX, 110), notch(RX, 110)], ropes: [{ ...A, path: rope(LX, [110]), end: false }, { ...A, path: rope(RX, [110]), end: false }] },
    { height: 380, poles: [rung(75), rung(195), rung(315)], ropes: [{ ...A, path: rope(LX, [75, 195, 315]), end: false }, { ...A, path: rope(RX, [75, 195, 315]), end: false }], arrows: [[[200, 45], [200, 20]]] },
  ],
};

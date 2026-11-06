import { A, B, G, coilH, coilV, move, rev } from '../helpers.mjs';

// Palo vertical (x 170–220, eje en 195).
const post = { x: 170, y: -10, w: 50, h: 320 };
const PX = 195, R = 34;

// Ballestrinque: dos vueltas bajando; el chicote sale por debajo de la segunda diagonal.
const clove1 = [[-20, 90], [120, 92], ...coilV({ x: PX, y: 95, n: 1, pitch: 55, r: R })];
const clove2 = [[-20, 90], [120, 92], ...coilV({ x: PX, y: 95, n: 2, pitch: 55, r: R })];
const cloveEnd = [[150, 205], [178, 178, 0.5], [214, 160, 0.5], [245, 156], [330, 160], [380, 168]];

// Vuelta redonda: el firme llega por la izquierda (y = 80), vuelta y media al palo, el chicote vuelve por y = 150.
const rt = [[-20, 80], [100, 80], ...coilV({ x: PX, y: 80, n: 1.5 * 0 + 1, pitch: 34, r: R }), ...coilV({ x: PX, y: 114, n: 1, pitch: 34, r: R }).slice(1, 5), [140, 150], [110, 150]];
/** Medio cote del chicote alrededor de una cuerda horizontal en y: sube por delante, baja por detrás y pasa por dentro de su vuelta, avanzando hacia la izquierda. */
export const half = (x, y) => [[x + 12, y + 32], [x, y, 1], [x - 10, y - 24], [x - 28, y - 22], [x - 34, y, -1], [x - 30, y + 26], [x - 46, y + 36]];

export default {
  ballestrinque: [
    { poles: [post], ropes: [{ ...A, path: [...clove1, [140, 172], [110, 200]] }], arrows: [[[95, 215], [120, 250], [150, 255]]] },
    { poles: [post], ropes: [{ ...A, path: [...clove2, [140, 225], [110, 240]] }], arrows: [[[110, 260], [140, 200], [175, 182]]] },
    { poles: [post], ropes: [{ ...A, path: [...clove2, ...cloveEnd] }] },
    null,
  ],
  'vuelta-redonda': [
    { poles: [post], ropes: [{ ...A, path: rt }], arrows: [[[95, 170], [70, 185]]] },
    { poles: [post], ropes: [{ ...A, path: [...rt.slice(0, -1), ...half(120, 80), [40, 150]] }], under: [[96, 104]] },
    { poles: [post], ropes: [{ ...A, path: [...rt.slice(0, -1), ...half(120, 80), ...half(62, 80).slice(1), [-20, 125]] }], under: [[96, 104], [38, 104]], arrows: [[[60, 30], [120, 30]]] },
  ],
  alondra: [
    { ropes: [{ ...G, path: [[-20, 115], [120, 115], [200, 115, -1], [270, 118], [305, 150], [270, 182], [200, 185, -1], [120, 185], [-20, 185]], end: false }], poles: [{ ...post, x: 175, w: 50 }],
      arrows: [[[320, 150], [350, 150]]] },
    { ropes: [{ ...G, path: [[-20, 140], [100, 140], [150, 145, -0.5], [195, 148, -1], [240, 140], [248, 120], [200, 108, 1], [150, 110], [126, 150, 1], [150, 192], [200, 196, 1], [248, 184], [240, 165], [195, 160, -1], [150, 162, -0.5], [100, 168], [-20, 168]], end: false }], poles: [{ ...post, x: 175, w: 50 }],
      arrows: [[[60, 215], [10, 215]]] },
  ],
  'medios-cotes': [
    { poles: [post], ropes: [{ ...A, path: [[-20, 80], [100, 80], ...coilV({ x: PX, y: 80, n: 1, pitch: 50, r: R }).slice(0, 7), [140, 132], ...half(120, 80), [40, 150]] }], under: [[96, 104]] },
    { poles: [post], ropes: [{ ...A, path: [[-20, 80], [100, 80], ...coilV({ x: PX, y: 80, n: 1, pitch: 50, r: R }).slice(0, 7), [140, 132], ...half(120, 80), ...half(62, 80).slice(1), [-20, 125]] }], under: [[96, 104], [38, 104]] },
    { poles: [post], ropes: [{ ...A, path: [[-20, 80], [80, 80], ...coilV({ x: PX, y: 80, n: 1, pitch: 50, r: R }).slice(0, 7), [150, 132], ...half(148, 80), ...half(110, 80).slice(1), [40, 125]] }], under: [[124, 104], [86, 104]], arrows: [[[60, 180], [120, 180]]] },
  ],
  constrictor: [
    { poles: [post], ropes: [{ ...A, path: [...clove1, [140, 172], [110, 200]] }], arrows: [[[95, 215], [120, 250], [150, 255]]] },
    { poles: [post], ropes: [{ ...A, path: [...clove2, [140, 225], [110, 240]] }], arrows: [[[110, 260], [150, 175], [190, 125]]] },
    { poles: [post], ropes: [{ ...A, path: [...clove2, [150, 205], [172, 168, 0.5], [195, 135, 0.5], [216, 110, 0.5], [250, 96], [330, 92], [380, 95]] }] },
  ],
  ancla: (() => {
    const ring = { kind: 'ring', x: 200, y: 60, r: 52 };
    const turns = [[150, 250], [165, 180], ...coilH({ x: 172, y: 112, n: 2, pitch: 22, r: 16, from: 'top' }), [232, 150], [245, 200]];
    return [
      { poles: [ring], ropes: [{ ...A, path: [...turns, [250, 250]] }] },
      { poles: [ring], ropes: [{ ...A, path: [...turns, [235, 240], [180, 245], [150, 215, 1], [140, 180], [165, 150], [195, 120, 0.5], [235, 95], [270, 90]] }] },
      { poles: [ring], ropes: [{ ...A, path: [...turns, [235, 240], [180, 245], [150, 215, 1], [140, 180], [165, 150], [195, 120, 0.5], [230, 112], [215, 175], [170, 205, 1], [130, 220], [132, 250, -1], [165, 262], [190, 275]] }] },
    ];
  })(),
  lenador: (() => {
    const log = { x: 40, y: 140, w: 330, h: 60, rx: 22 };
    const around = [[200, -20], [200, 60], [200, 120], [205, 170, 1], [215, 210], [240, 210], [245, 170, -1], [245, 128], [230, 100]];
    return [
      { poles: [log], ropes: [{ ...A, path: [...around.slice(0, -1), [255, 100], [300, 80]] }] },
      { poles: [log], ropes: [{ ...A, path: [...around, [190, 85, 1], [165, 95], [170, 125], [220, 128]] }] },
      { poles: [log], ropes: [{ ...A, path: [...around, [190, 85, 1], [165, 95], [168, 122], ...coilH({ x: 180, y: 130, n: 3, pitch: 18, r: 9, from: 'top' }).slice(1), [250, 132], [275, 128]] }], arrows: [[[230, 20], [230, -5]]] },
      null,
    ];
  })(),
  tensor: (() => {
    const stake = { x: 320, y: 60, w: 34, h: 190, rx: 8 };
    const back = [[-20, 110], [120, 110], [300, 110], [337, 98, -1], [372, 118], [372, 165], [337, 182, 1], [300, 170], [230, 170]];
    const two = coilH({ x: 205, y: 110, n: 2, pitch: 26, r: 22, from: 'bottom' });
    return [
      { poles: [stake], ropes: [{ ...A, path: [...back, [180, 172]] }], arrows: [[[170, 195], [130, 195]]] },
      { poles: [stake], ropes: [{ ...A, path: [...back, [200, 150], ...two, [270, 145], [250, 175]] }] },
      { poles: [stake], ropes: [{ ...A, path: [...back, [200, 150], ...two, [270, 145], [240, 178], [170, 175], [140, 140], ...coilH({ x: 140, y: 110, n: 1, pitch: 26, r: 22, from: 'bottom' }).slice(1), [168, 150], [150, 175], [120, 200]] }] },
      { poles: [stake], ropes: [{ ...A, path: [...back, [200, 150], ...two, [270, 145], [240, 178], [170, 175], [140, 140], ...coilH({ x: 140, y: 110, n: 1, pitch: 26, r: 22, from: 'bottom' }).slice(1), [168, 150], [150, 175], [120, 200]] }], arrows: [[[150, 60], [250, 60]]] },
    ];
  })(),
  camionero: (() => {
    const ring = { kind: 'ring', x: 40, y: 150, r: 22 };
    const post2 = { x: 350, y: 40, w: 36, h: 230, rx: 8 };
    const start = [[50, 128], [70, 140], [80, 150]];
    const toLoop = [...start, [150, 150], [195, 150], [215, 175], [212, 205], [192, 212], [178, 195], [190, 165, 1], [215, 150], [260, 150]];
    const around = [[330, 150], [365, 140, -1], [395, 160], [395, 190], [365, 200, 1], [320, 195], [250, 200], [215, 195, 0.5], [190, 190, -0.5], [170, 205], [150, 240]];
    return [
      { poles: [ring, post2], ropes: [{ ...A, path: [...start, [200, 150], [300, 150]] }] },
      { poles: [ring, post2], ropes: [{ ...A, path: [...toLoop, [300, 150]] }] },
      { poles: [ring, post2], ropes: [{ ...A, path: [...toLoop, ...around] }] },
      { poles: [ring, post2], ropes: [{ ...A, path: [...toLoop, ...around] }], arrows: [[[130, 250], [100, 290]]] },
    ];
  })(),
};

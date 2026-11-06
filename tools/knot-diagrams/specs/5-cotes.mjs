import { A, B, G, coilAlong, coilH, coilV, move, rev } from '../helpers.mjs';

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
    (() => {
      // En un mosquetón: el mismo ballestrinque sobre la barra larga (lomo) del mosquetón.
      const biner = { kind: 'path', d: 'M200 20c-50 0-70 35-66 75l6 120c3 50 117 50 120 0l6-120c4-40-16-75-66-75zm0 16c38 0 52 28 50 60l-6 117c-2 34-86 34-88 0l-6-117c-2-32 12-60 50-60z', fill: '#9aa1ab', stroke: '#5c626b' };
      const sx = 143; // lomo del mosquetón
      const c = [[-20, 100], [80, 104], ...coilV({ x: sx, y: 110, n: 2, pitch: 46, r: 24 }), [110, 205], [128, 186, 0.5], [158, 168, 0.5], [190, 160], [300, 170], [380, 180]];
      return { height: 320, poles: [{ x: 160, y: 0, w: 80, h: 14, rx: 5, fill: '#8f949b', stroke: '#585c62' }, biner], ropes: [{ ...A, path: c }] };
    })(),
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
    // Argolla arriba; el firme sube desde abajo a la izquierda y da dos vueltas a la barra de abajo de la argolla (y = 150).
    const ring = { kind: 'ring', x: 200, y: 88, r: 62, w: 13 };
    const turns = [[120, 345], [150, 260], [166, 190], ...coilH({ x: 168, y: 150, n: 2, pitch: 30, r: 22, from: 'bottom' })];
    // El chicote baja, rodea el firme por detrás y sube por dentro de las dos vueltas (entre ellas y la argolla).
    const tuck = [[236, 195], [225, 240], [190, 252], [160, 250, -1], [128, 240], [132, 215], [160, 205, 1], [195, 182, 0.5], [200, 150, 0.5], [205, 118], [225, 100], [262, 110]];
    // Medio cote alrededor del firme, más abajo.
    const halfHitch = [[280, 160], [262, 250], [205, 290], [168, 288, 1], [140, 280], [132, 302], [150, 312, -1], [178, 312], [190, 300, 1], [230, 318], [270, 330]];
    return [
      { height: 340, poles: [ring], ropes: [{ ...A, path: [...turns, [240, 210], [245, 250]] }] },
      { height: 340, poles: [ring], ropes: [{ ...A, path: [...turns, ...tuck] }] },
      { height: 340, poles: [ring], ropes: [{ ...A, path: [...turns, ...tuck, ...halfHitch] }] },
    ];
  })(),
  lenador: (() => {
    // Tronco acostado; el firme baja desde arriba. La vuelta cruza el frente en diagonal, pasa por abajo y sube por detrás.
    const log = { x: 20, y: 140, w: 360, h: 70, rx: 26 };
    const loop = [[110, -20], [112, 60], [118, 108], [150, 150, 1], [190, 196, 1], [205, 222], [225, 212], [215, 170, -1], [185, 130, -1], [160, 112]];
    // El chicote rodea el firme (por detrás y por delante) y vuelve sobre la diagonal de adelante.
    const collar = [[150, 98], [128, 70, -1], [96, 68], [82, 92], [100, 116, 2], [130, 126]];
    const dog = coilAlong([138, 130], [196, 200], 3, 17).map(([x, y, zz]) => [x, y, zz * 2]);
    return [
      { poles: [log], ropes: [{ ...A, path: [...loop, [170, 95], [200, 70]] }], arrows: [[[215, 60], [160, 50], [100, 70]]] },
      { poles: [log], ropes: [{ ...A, path: [...loop, ...collar, [150, 135], [165, 160]] }], arrows: [[[200, 130], [222, 160], [214, 200]]] },
      { poles: [log], ropes: [{ ...A, path: [...loop, ...collar, ...dog, [206, 212], [212, 222]] }], arrows: [[[85, 40], [85, 5]]] },
      (() => {
        // Para arrastrar: el firme sigue por el tronco y da un cote cerca de la punta.
        const tail = [[110, 60], [112, 90]];
        const hitch = [[330, 125], [322, 150, 1], [318, 200, 1], [330, 222], [350, 212], [348, 170, -1], [340, 132, -1], [325, 118], [300, 122], [300, 140, 2], [310, 160, 2], [345, 168, 3], [420, 168]];
        return {
          poles: [log],
          ropes: [{ ...A, path: [[440, 168], [400, 168], ...rev(hitch).slice(2, -3), [300, 128], [220, 128], [150, 118], [125, 112], ...loop.slice(3), ...collar, ...dog, [206, 212], [212, 222]] }],
          arrows: [[[350, 100], [392, 100]]],
        };
      })(),
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

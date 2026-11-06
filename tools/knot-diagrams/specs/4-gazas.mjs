import { A, E8, move, offset, overhand, rev, scale } from '../helpers.mjs';

// As de guía (firme arriba), con la profundidad en cada cruce: el firme es lo
// de más abajo; el chicote sube por debajo de la gaza chica y baja por encima.
const base = { width: 400, height: 420, rope: 14 };
const small = [[200, -20], [200, 60, 0.5], [203, 108, -0.5], [255, 142, -0.5], [260, 205, 0.5], [200, 240, 0.5], [138, 212], [130, 150], [165, 116, -0.5], [215, 110, 0.5], [262, 118], [290, 145]];
const big = [[308, 220], [310, 320], [250, 395], [160, 388], [112, 330], [125, 282], [168, 262], [169, 234, -0.5], [168, 205], [164, 150], [158, 100, 0.5], [160, 65]];
const around = [[175, 32], [200, 22, -0.5], [226, 32], [240, 66]];
const down = [[238, 112, 1], [232, 170], [230, 235, -0.5], [238, 290]];
export const bowline = [...small, ...big, ...around, ...down];

/** Cuerda doble: ida por `p` y vuelta en paralelo (el seno queda en la punta). */
const doubled = (p, d = 15) => [...p, ...rev(offset(p, d))];

// Corredizo: el firme llega por la izquierda (y = 150), da la vuelta a la derecha y el chicote vuelve por arriba (y = 112).
const nooseLoop = [[-20, 150], [100, 150], [250, 150], [300, 200], [360, 192], [372, 110], [330, 62], [288, 92], [250, 112]];
const nooseKnot = (k) => overhand({ x: 150, y: 150, k, mirror: true, flip: true });

// Ocho sobre seno: el ocho de siempre hecho con la cuerda doble; la gaza sale a la derecha.
const e8 = move(E8, 0, -30);
const eye = [[392, 155], [430, 140], [425, 85], [385, 85], [362, 105]];

export default {
  'as-de-guia': [
    { ...base, ropes: [{ ...A, path: [...small, [305, 230], [310, 320]] }], arrows: [[[305, 350], [255, 392], [160, 380], [150, 320], [168, 275]]] },
    { ...base, ropes: [{ ...A, path: [...small, ...big] }], arrows: [[[150, 45], [180, 8], [230, 10], [252, 50]]] },
    { ...base, ropes: [{ ...A, path: [...small, ...big, ...around] }], arrows: [[[246, 82], [238, 140], [234, 205]]] },
    { ...base, ropes: [{ ...A, path: bowline }] },
    (() => {
      // Seguro: con el chicote, un nudo simple alrededor del tramo de abajo de la gaza grande.
      const oh = overhand({ x: 205, y: 392, k: 0.45, flip: true });
      return { ...base, height: 440, ropes: [{ ...A, path: [...bowline.slice(0, -1), [236, 280], [200, 318], [150, 345], ...oh.path, [265, 360]] }], under: [[202, 392], ...oh.under] };
    })(),
  ],
  'as-de-guia-doble': [
    { ...base, ropes: [{ ...A, path: doubled([[192, -20], [192, 150], [192, 300]]), end: false }], arrows: [[[230, 320], [230, 380]]] },
    { ...base, rope: 11, ropes: [{ ...A, path: doubled([...small, ...big.slice(0, -1), [162, 72]], 13), end: false }] },
    { ...base, rope: 11, ropes: [{ ...A, path: doubled([...small, ...big.slice(0, -1), [162, 72]], 13), end: false }], arrows: [[[140, 60], [80, 160], [90, 330], [200, 405]]] },
    { ...base, rope: 11, ropes: [{ ...A, path: doubled([...small, ...big, ...around], 13), end: false }] },
  ],
  corredizo: [
    { ropes: [{ ...A, path: [...nooseLoop, [150, 112], [90, 112]] }], arrows: [[[70, 95], [40, 80]]] },
    { ropes: [{ ...A, path: [...nooseLoop, ...nooseKnot(0.55).path, [80, 185]] }], under: [[147, 150], ...nooseKnot(0.55).under] },
    { ropes: [{ ...A, path: [...nooseLoop.slice(0, -1), [230, 120], ...nooseKnot(0.42).path.slice(1), [100, 175]] }], under: [[147, 150], ...nooseKnot(0.42).under], arrows: [[[150, 205], [215, 205]]] },
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [250, 150], [280, 185], [320, 185], [330, 140], [305, 105], [270, 112], [230, 120], ...nooseKnot(0.42).path.slice(1), [100, 175]] }], under: [[147, 150], ...nooseKnot(0.42).under], arrows: [[[60, 125], [10, 125]]] },
  ],
  'ocho-gaza': [
    { width: 440, ropes: [{ ...A, path: doubled([[-20, 190], [200, 190], [380, 190]]), end: false }] },
    { width: 440, rope: 12, ropes: [{ ...A, path: [...e8, ...eye, ...rev(offset(e8, 15))], end: false }] },
    { width: 440, rope: 12, ropes: [{ ...A, path: [...e8, ...eye, ...rev(offset(e8, 15))], end: false }], arrows: [[[40, 240], [5, 240]], [[420, 160], [435, 200]]] },
  ],

  'ocho-doble': (() => {
    const tail = [[350, 142], [372, 168], [395, 200], [402, 240, -1], [380, 262, -1], [352, 238], [348, 175]];
    const ring = { kind: 'ring', x: 398, y: 228, r: 26 };
    const back = rev(offset(e8, -15));
    return [
      { width: 440, ropes: [{ ...A, path: [...e8.slice(0, -1), [350, 142], [395, 160], [430, 190]] }] },
      { width: 440, poles: [ring], ropes: [{ ...A, path: [...e8.slice(0, -1), ...tail, [330, 200]] }] },
      { width: 440, poles: [ring], ropes: [{ ...A, path: [...e8.slice(0, -1), ...tail, ...back.slice(1, 12)] }] },
      { width: 440, poles: [ring], ropes: [{ ...A, path: [...e8.slice(0, -1), ...tail, ...back.slice(1, -3), [90, 205]] }], arrows: [[[40, 160], [5, 160]]] },
    ];
  })(),
  'ocho-direccional': (() => {
    // Un ocho a lo largo de la cuerda, con una de sus orejas estirada: esa es la gaza (como en el FM 3-97.61).
    const d8 = [[-20, 220], [100, 220], [150, 220, 0.5], [194, 220, -0.5], [235, 216], [290, 180], [296, 135, 0.5], [330, 100], [390, 65], [415, 30], [380, 12], [320, 25], [245, 58], [185, 80], [168, 140], [178, 180, -0.5], [194, 220, 0.5], [215, 265], [180, 290], [140, 270], [150, 220, -0.5], [178, 180, 0.5], [245, 140], [296, 135, -0.5], [350, 142], [460, 142]];
    return [
      { width: 440, ropes: [{ ...A, path: [...d8.slice(0, 15), [175, 175], [205, 205], [300, 225], [460, 228]], end: false }], arrows: [[[230, 290], [180, 300], [135, 280]]] },
      { width: 440, ropes: [{ ...A, path: [...d8.slice(0, 21), [175, 175], [260, 160], [460, 160]], end: false }] },
      { width: 440, ropes: [{ ...A, path: d8, end: false }], arrows: [[[425, 50], [440, 20]]] },
    ];
  })(),
  'ocho-dos-gazas': (() => {
    const ears = [[392, 155], [432, 185], [420, 235], [378, 215], [388, 120], [425, 95], [405, 55], [362, 105]];
    return [
      { width: 440, rope: 12, ropes: [{ ...A, path: [...e8.slice(0, 13), ...rev(offset(e8.slice(0, 13), 15))], end: false }] },
      { width: 440, rope: 12, ropes: [{ ...A, path: [...e8, ...ears, ...rev(offset(e8, 15))], end: false }] },
      { width: 440, rope: 12, ropes: [{ ...A, path: [...e8, ...ears, ...rev(offset(e8, 15))], end: false }], arrows: [[[300, 30], [360, 40], [390, 75]]] },
      { width: 440, rope: 12, ropes: [{ ...A, path: [...e8, ...ears, ...rev(offset(e8, 15))], end: false }], arrows: [[[440, 220], [440, 260]], [[440, 90], [440, 50]]] },
    ];
  })(),
  mariposa: (() => {
    const hand = { x: 110, y: 105, w: 230, h: 90, rx: 40, fill: '#e8c3a0', stroke: '#a77b58' };
    const wraps = [[-20, 280], [60, 250], [130, 220], ...((h) => h)(coilH3())];
    function coilH3() {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const x = 160 + i * 55;
        out.push([x, 215, 0], [x + 10, 150, 1], [x + 20, 85, 0], [x + 32, 150, -1]);
      }
      out.push([325, 215, 0], [380, 250], [420, 280]);
      return out;
    }
    const fly = [[-20, 235], [120, 235], [200, 225], [245, 195], [200, 165], [150, 125], [145, 80], [175, 40], [228, 40], [258, 85], [250, 125], [200, 165], [155, 195], [200, 225], [280, 235], [420, 235]];
    return [
      { poles: [hand], ropes: [{ ...A, path: wraps }] },
      { poles: [hand], ropes: [{ ...A, path: wraps }], arrows: [[[285, 70], [200, 60], [180, 120], [205, 235]]] },
      { ropes: [{ ...A, path: fly }], under: [[200, 224]], arrows: [[[200, 30], [200, 5]], [[40, 265], [5, 265]], [[355, 265], [395, 265]]] },
    ];
  })(),
  'as-de-guia-corredizo': (() => {
    const bw = move(scale(bowline, 0.42), 70, 120);
    const pull = [[-20, 300], [80, 298], [128, 296, 0.5], [182, 296, -0.5], [260, 285], [320, 220], [330, 130], [290, 70], [230, 50], [170, 75], [158, 112]];
    return [
      { height: 320, ropes: [{ ...A, path: [[155, -20], ...bw.slice(1)] }] },
      { height: 320, ropes: [{ ...A, path: [...pull, ...bw.slice(2)] }] },
      { height: 320, ropes: [{ ...A, path: [...pull, ...bw.slice(2)] }], arrows: [[[60, 275], [10, 275]]] },
      null,
    ];
  })(),
};

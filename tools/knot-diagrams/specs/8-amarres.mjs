import { A, coilAlong, coilH, coilV } from '../helpers.mjs';

const H = { height: 340 };
const wood = (x, y, w, h, rotate = 0) => ({ x, y, w, h, rx: Math.min(w, h) / 2.5, rotate });
// Cruz: palo vertical (eje x = 200) y horizontal (eje y = 170).
const vert = wood(176, -10, 48, 360);
const horiz = wood(-10, 146, 420, 48);
const clove = (x, y) => [[x - 60, y + 40], [x - 40, y + 20], ...coilV({ x, y, n: 2, pitch: 18, r: 30 }).slice(0, 13)];

// Vueltas de la cuadrada: adelante sobre el horizontal a cada lado del vertical y por detrás del vertical arriba y abajo.
const square = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = i * 9;
    out.push([150 - d, 125 - d, 1], [150 - d, 215 + d, 1], [200, 222 + d, -1], [250 + d, 215 + d, 1], [250 + d, 125 - d, 1], [200, 118 - d, -1]);
  }
  return out;
};

const pair = [wood(150, -10, 44, 360), wood(206, -10, 44, 360)];
const X = [wood(-30, 146, 460, 48, 35), wood(-30, 146, 460, 48, -35)];
const tri = [wood(110, -10, 40, 360), wood(180, -10, 40, 360), wood(250, -10, 40, 360)];

export default {
  'atadura-cuadrada': [
    { ...H, poles: [horiz, vert], ropes: [{ ...A, path: clove(200, 230) }] },
    { ...H, poles: [horiz, vert], ropes: [{ ...A, path: [...clove(200, 230), [150, 230], ...square(3)] }] },
    { ...H, poles: [horiz, vert], ropes: [{ ...A, path: [...clove(200, 230), [150, 230], ...square(3), [176, 100, 1], [220, 145, 2], [176, 145, -1], [222, 100, 2], [240, 80]] }] },
    { ...H, poles: [horiz, vert], ropes: [{ ...A, path: [...clove(200, 230), [150, 230], ...square(3), [176, 100, 1], [220, 145, 2], [176, 145, -1], [222, 100, 2], [300, 120], ...coilH({ x: 320, y: 170, n: 2, pitch: 18, r: 30, from: 'top' }).slice(0, 13), [380, 215]] }] },
  ],
  'atadura-tijera': [
    { ...H, poles: pair, ropes: [{ ...A, path: [[60, 160], [100, 140], ...coilV({ x: 172, y: 120, n: 2, pitch: 18, r: 30 }).slice(0, 13), [120, 175]] }] },
    { ...H, poles: pair, ropes: [{ ...A, path: [[60, 120], [100, 120], ...coilV({ x: 200, y: 110, n: 7, pitch: 16, r: 62 })] }] },
    { ...H, poles: pair, ropes: [{ ...A, path: [[60, 120], [100, 120], ...coilV({ x: 200, y: 110, n: 7, pitch: 16, r: 62 }), [200, 240, 1], [200, 90, 2], [228, 80], [228, 100, 2], ...coilV({ x: 228, y: 250, n: 2, pitch: 18, r: 30 }).slice(0, 13)] }], arrows: [[[150, 320], [110, 340]], [[250, 320], [290, 340]]] },
  ],
  'atadura-diagonal': (() => {
    // Palos en X (cruce en 200, 170). Cada vuelta pasa por delante y vuelve por detrás justo debajo de la siguiente (queda tapada).
    const V = (i) => 170 + (i - 1.5) * 26; // x de cada vuelta vertical (primera diagonal)
    const Hy = (i) => 170 + (i - 1.5) * 26; // y de cada vuelta horizontal (segunda diagonal)
    const verts = [];
    for (let i = 0; i < 3; i++) verts.push([V(i), 92], [V(i), 170, 1], [V(i), 248], [V(i) + 13, 262], [V(i + 1), 248, -1], [V(i + 1), 170, -1], [V(i + 1), 92, -1], [V(i + 1) + 6, 80]);
    const horiz = [];
    for (let i = 0; i < 3; i++) horiz.push([110, Hy(i)], [200, Hy(i), 2], [290, Hy(i)], [304, Hy(i) + 13], [290, Hy(i + 1), -1], [200, Hy(i + 1), -1], [110, Hy(i + 1), -1], [98, Hy(i + 1) + 6]);
    const startV = [[40, 40], [100, 60], [V(0) - 20, 78]];
    const toH = [[V(3) + 30, 70], [300, 100], [130, 98], [100, Hy(0) - 8]];
    // Ajuste: entre los dos palos (se ve solo en los huecos), dos vueltas alrededor del cruce.
    // Ajuste: dos vueltas que aprietan el atado, por delante arriba y abajo del cruce y por detrás al costado.
    const frap = [[104, 236], [125, 262, 3], [170, 266, 3], [222, 262, 3], [244, 250], [250, 170, -1], [244, 88], [222, 76, 3], [170, 72, 3], [125, 76, 3], [104, 92], [95, 115]];
    // Ballestrinque final en el brazo de arriba a la izquierda, al lado de donde termina el ajuste.
    const clove = [[96, 112], ...coilAlong([100, 100], [62, 74], 2, 33).map(([x, y, zz]) => [x, y, zz * 3]), [40, 70], [20, 60]];
    // Leñador para empezar: una vuelta y el chicote enroscado sobre sí mismo arriba.
    const timber = [...startV, [V(0), 92], [V(0), 170, 1], [V(0), 248], [V(0) + 13, 262], [V(1), 248, -1], [V(1), 170, -1], [V(1), 92, -1], [V(1) + 10, 70], [V(0) + 5, 60], ...coilAlong([V(0) - 18, 70], [V(0) - 2, 98], 2, 9).map(([x, y, zz]) => [x, y, zz * 2])];
    const all = (...parts) => ({ height: 340, poles: X, ropes: [{ ...A, path: parts.flat() }] });
    return [
      { ...all(timber), arrows: [[[V(1) + 30, 120], [V(1) + 30, 220]]] },
      all(startV, verts),
      all(startV, verts, toH, horiz),
      all(startV, verts, toH, horiz, frap),
      all(startV, verts, toH, horiz, frap, clove),
    ];
  })(),
  'atadura-tripode': [
    { ...H, poles: tri },
    { ...H, poles: tri, ropes: [{ ...A, path: [[40, 160], [80, 130], ...coilV({ x: 130, y: 110, n: 1, pitch: 18, r: 28 }).slice(0, 7), ...[0, 1, 2].flatMap((i) => { const y = 120 + i * 22; return [[130, y, 1], [165, y + 5, 1], [200, y, -1], [235, y + 5, -1], [270, y, 1], [300, y + 8], [270, y + 14, -1], [235, y + 10, 1], [200, y + 14, 1], [165, y + 10, -1], [130, y + 14, -1], [100, y + 20]]; })] }] },
    { ...H, poles: tri, ropes: [{ ...A, path: [[40, 160], [80, 130], ...coilV({ x: 130, y: 110, n: 1, pitch: 18, r: 28 }).slice(0, 7), ...[0, 1, 2].flatMap((i) => { const y = 120 + i * 22; return [[130, y, 1], [165, y + 5, 1], [200, y, -1], [235, y + 5, -1], [270, y, 1], [300, y + 8], [270, y + 14, -1], [235, y + 10, 1], [200, y + 14, 1], [165, y + 10, -1], [130, y + 14, -1], [100, y + 20]]; }), [120, 200], ...coilV({ x: 270, y: 210, n: 2, pitch: 18, r: 28 }).slice(0, 13)] }], arrows: [[[110, 320], [70, 340]], [[290, 320], [330, 340]]] },
  ],
};

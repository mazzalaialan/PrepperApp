import { A, B, coilH, flipX, move, overhand } from '../helpers.mjs';

// Media vuelta (primer paso de los cordones): dos puntas que se retuercen una vez.
const twistA = [[40, 295], [130, 250], [190, 222], [236, 196], [240, 168], [205, 150], [170, 138]];
const twistB = [[360, 295], [270, 250], [210, 222], [164, 196], [160, 168], [195, 150], [230, 138]];
// Segunda media vuelta, al revés.
const topA = [[200, 120], [236, 100], [240, 75], [205, 60], [150, 40], [100, 15]];
const topB = [[200, 120], [164, 100], [160, 75], [195, 60], [250, 40], [300, 15]];

// Rizo terminado: dos senos enlazados.
const reefA = [[-20, 120], [150, 120], [215, 125], [240, 150], [215, 175], [150, 180], [-20, 180]];
const reefB = [[420, 105], [250, 105], [180, 108], [158, 150], [180, 192], [250, 195], [420, 195]];

// Escota: seno de la cuerda gruesa (naranja) y la fina (azul) que lo rodea.
const bight = [[-20, 110], [150, 110], [240, 112], [282, 150], [240, 188], [150, 190], [-20, 190]];
const sheet1 = [[420, 250], [330, 230], [272, 190], [262, 150, 1], [262, 120, 1], [270, 80]];
const sheetWrap = [[290, 60], [325, 75], [320, 120, -1], [318, 175, -1], [300, 215], [240, 225], [212, 200], [212, 150, 1]];

// Pescador: dos puntas paralelas, cada una con un simple alrededor de la otra.
const fishA = [[-20, 135], [120, 135], [300, 135], [340, 135]];
const fishB = [[420, 165], [280, 165], [100, 165], [60, 165]];
const knotOn = (x, y, dir) => {
  // nudo simple de una punta alrededor de la otra cuerda (eje horizontal en y)
  const s = dir; // 1: la punta va a la derecha
  return [[x, y], [x + s * 40, y - 5], [x + s * 70, y - 35], [x + s * 50, y - 62], [x + s * 20, y - 45, 1], [x + s * 30, y + 25, 1], [x + s * 55, y + 45], [x + s * 75, y + 20], [x + s * 60, y - 12, 2], [x + s * 40, y - 25, 2], [x + s * 95, y - 30]];
};

export default {
  rizo: [
    { ropes: [{ ...A, path: twistA }, { ...B, path: twistB }], under: [[200, 214]], arrows: [[[150, 120], [175, 80], [215, 60]]] },
    { ropes: [{ ...A, path: [...twistA, ...topA] }, { ...B, path: [...twistB, ...topB] }], under: [[200, 214], [200, 70]] },
    { ropes: [{ ...A, path: reefA }, { ...B, path: reefB }], under: [[161, 120]], arrows: [[[40, 230], [5, 230]], [[355, 240], [395, 240]]] },
  ],
  cirujano: (() => {
    // Doble media vuelta (las puntas se rodean dos veces); después una media vuelta al revés.
    const a2 = [[40, 295], [130, 255], [185, 230], [232, 210], [236, 188], [200, 178], [168, 168], [164, 150], [200, 140], [236, 130], [240, 110], [200, 100], [160, 90], [130, 60]];
    const b2 = [[360, 295], [270, 255], [215, 230], [168, 210], [164, 188], [200, 178], [232, 168], [236, 150], [200, 140], [164, 130], [160, 110], [200, 100], [240, 90], [270, 60]];
    const tight = (p) => p.map(([x, y]) => (y < 235 ? [200 + (x - 200) * 0.85, 235 - (235 - y) * 0.7] : [x, y]));
    const U = [[200, 222], [200, 140]];
    return [
      { ropes: [{ ...A, path: a2 }, { ...B, path: b2 }], under: U },
      { ropes: [{ ...A, path: tight(a2) }, { ...B, path: tight(b2) }], under: [[200, 227], [200, 168]], arrows: [[[60, 270], [25, 290]], [[340, 270], [375, 290]]] },
      { ropes: [{ ...A, path: [...tight(a2).slice(0, -2), [165, 120], [160, 95], [200, 80], [240, 65], [270, 40]] }, { ...B, path: [...tight(b2).slice(0, -2), [235, 120], [240, 95], [200, 80], [160, 65], [130, 40]] }], under: [[200, 227], [200, 168], [200, 80]] },
    ];
  })(),
  'escota-doble': [
    { ropes: [{ ...A, path: bight }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheet1 }], under: [[264, 182]], arrows: [[[285, 70], [330, 80], [335, 150]]] },
    { ropes: [{ ...A, path: bight }, { ...B, path: [...sheet1, ...sheetWrap, [205, 100], [175, 60]] }], under: [[264, 182], [221, 112]] },
    { ropes: [{ ...A, path: bight }, { ...B, path: [...sheet1, ...sheetWrap.slice(0, 5), [345, 70], [345, 210, -1], [300, 230], [230, 236], [200, 210], [200, 150, 1], [195, 100], [165, 60]] }], under: [[264, 182]] },
    { width: 400, ropes: [{ ...A, path: [[-20, 120], [150, 120], [228, 125], [252, 150], [228, 175], [150, 180], [-20, 180]] }, { ...B, path: [[420, 230], [320, 210], [262, 170], [262, 150, 1], [268, 120], [285, 105], [295, 120, -1], [292, 170, -1], [270, 195], [230, 192], [215, 160, 1], [210, 140], [180, 95], [150, 75]] }],
      arrows: [[[40, 230], [5, 230]], [[370, 260], [400, 270]]] },
  ],
  pescador: (() => {
    const oa = overhand({ x: 250, y: 130, k: 0.55 }); // firme naranja en y = 168
    const ob = overhand({ x: 150, y: 168, k: 0.55, mirror: true, flip: true }); // firme azul en y = 130
    const blueLine = [[420, 130], [300, 130], [120, 130], [60, 130]];
    return [
      { ropes: [{ ...A, path: [[-20, 168], [120, 168], [300, 168], [340, 168]] }, { ...B, path: [[420, 130], [280, 130], [100, 130], [60, 130]] }] },
      { ropes: [{ ...A, path: [[-20, 168], [80, 168], ...oa.path, [330, 90]] }, { ...B, path: blueLine }], under: [[253, 130], ...oa.under], arrows: [[[70, 100], [115, 85], [150, 105]]] },
      { ropes: [{ ...A, path: [[-20, 168], [80, 168], ...oa.path, [330, 90]] }, { ...B, path: [[420, 130], [320, 130], ...ob.path, [70, 208]] }], under: [[253, 130], [147, 168], ...oa.under, ...ob.under],
        arrows: [[[40, 230], [5, 230]], [[355, 230], [395, 230]]] },
    ];
  })(),
  'pescador-doble': (() => {
    // Naranja por y = 168: da dos vueltas a la azul (y = 130) hacia la izquierda y vuelve por dentro.
    const a = [[-20, 168], [150, 168], [250, 168], [272, 160], ...coilH({ x: 282, y: 130, n: 2, pitch: 32, r: 28, from: 'bottom', left: true }), [200, 152], [222, 138, 0.5], [282, 138, 0.5], [312, 125], [345, 95]];
    const mirror = (p) => p.map(([x, y, zz]) => [400 - x, 298 - y, ...(zz === undefined ? [] : [zz])]);
    return [
      { ropes: [{ ...A, path: [[-20, 168], [120, 168], [300, 168], [340, 168]] }, { ...B, path: [[420, 130], [280, 130], [100, 130], [60, 130]] }] },
      { ropes: [{ ...A, path: a }, { ...B, path: [[420, 130], [300, 130], [120, 130], [60, 130]] }], arrows: [[[70, 100], [115, 85], [150, 105]]] },
      { ropes: [{ ...A, path: a }, { ...B, path: mirror(a) }], arrows: [[[40, 230], [5, 230]], [[355, 230], [395, 230]]] },
    ];
  })(),
};

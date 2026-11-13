import { A, B, G, coilH, coilV, move, rev } from '../helpers.mjs';

const H = { height: 340 };
const biner = (x, y, s = 1) => ({ kind: 'path', d: `M${x} ${y}c${-22 * s} 0 ${-30 * s} ${18 * s} ${-28 * s} ${40 * s}l${8 * s} ${70 * s}c${3 * s} ${18 * s} ${37 * s} ${18 * s} ${40 * s} 0l${8 * s} ${-70 * s}c${2 * s} ${-22 * s} ${-6 * s} ${-40 * s} ${-28 * s} ${-40 * s}zm0 ${10 * s}c${14 * s} 0 ${18 * s} ${14 * s} ${17 * s} ${30 * s}l${-7 * s} ${66 * s}c${-2 * s} ${10 * s} ${-18 * s} ${10 * s} ${-20 * s} 0l${-7 * s} ${-66 * s}c${-1 * s} ${-16 * s} ${3 * s} ${-30 * s} ${17 * s} ${-30 * s}z`, fill: '#9aa1ab', stroke: '#5c626b' });
const anchorBar = { x: 120, y: 0, w: 160, h: 22, rx: 6, fill: '#8f949b', stroke: '#585c62' };

// Dos gazas iguales en la mano (la de adelante, igual a la de atrás).
const loopAt = (cx) => [[cx - 40, 225], [cx - 5, 215], [cx + 25, 175], [cx + 10, 125], [cx - 35, 120], [cx - 52, 165], [cx - 30, 210, 1], [cx + 10, 228]];
const munter = [[140, 345], [168, 230], [186, 150], [196, 122, 1], [210, 96, -1], [226, 122], [214, 150, 1], [186, 140, 1], [180, 118, -1], [198, 98], [222, 135, 2], [236, 200], [262, 345]];

// Cornamusa: base y cuernos.
const cleat = { kind: 'path', d: 'M70 150c0-14 50-20 80-20h100c30 0 80 6 80 20s-50 20-80 20h-100c-30 0-80-6-80-20z', fill: '#9aa1ab', stroke: '#5c626b' };
const cleatBase = { x: 165, y: 140, w: 70, h: 40, rx: 8, fill: '#7e848c', stroke: '#5c626b' };

// Cuerpo esquemático para el arnés.
const body = [
  { x: 120, y: 60, w: 160, h: 80, rx: 36, fill: '#e8c3a0', stroke: '#a77b58' },
  { x: 125, y: 120, w: 62, h: 210, rx: 26, fill: '#e8c3a0', stroke: '#a77b58' },
  { x: 213, y: 120, w: 62, h: 210, rx: 26, fill: '#e8c3a0', stroke: '#a77b58' },
];

// Cadena: cada seno (lágrima con la punta a la derecha) pasa por la punta del anterior, que lo rodea por encima.
const link = (x, first = false) => [
  ...(first ? [] : [[x, 150]]),
  [x + 30, 136], [x + 72, 126], [x + 108, 134], [x + 122, 150, 1], [x + 108, 166], [x + 72, 174], [x + 44, 166], [x + 58, 155],
];
const chain = (n, end = false) => {
  const out = [[-20, 150], [20, 150]];
  for (let k = 0; k < n; k++) out.push(...link(30 + 70 * k, k === 0));
  if (end) out.push([30 + 70 * n, 150], [30 + 70 * n + 80, 152], [30 + 70 * n + 150, 160]);
  else out.push([30 + 70 * n + 40, 190], [30 + 70 * n + 90, 230]);
  return out;
};

// Dinámico (Munter) leído de la foto «Munter Hitch.jpg» (ver refs/dinamico.json): carga abajo a la izquierda, freno abajo a la derecha.
const MUNTER = [[120, 345], [160, 288], [190, 240, 0.5], [200, 205], [203, 182, -1], [203, 160, -1], [195, 140], [172, 128], [150, 134], [140, 158], [140, 180, 1], [143, 210, 1], [160, 228], [190, 240, -0.5], [215, 248], [235, 235], [238, 205], [236, 178, 1], [232, 150, 1], [238, 132], [255, 128], [266, 145], [266, 165, -1], [266, 182, -1], [264, 230], [262, 290], [262, 345]];

export default {
  dinamico: (() => {
    // Mosquetón grande (pera) visto de frente: la cuerda trabaja sobre su barra de abajo (y ≈ 170).
    const pear = { kind: 'path', d: 'M200 15c-60 0-85 40-80 90l8 70c4 30 140 30 144 0l8-70c5-50-20-90-80-90zm0 18c45 0 63 32 60 72l-8 66c-3 18-101 18-104 0l-8-66c-3-40 15-72 60-72z', fill: '#9aa1ab', stroke: '#5c626b' };
    // Leído de la foto «Munter Hitch.jpg» (CC BY-SA 4.0): son dos senos con vueltas de mano contraria alrededor de la barra, con UN cruce debajo.
    // La carga (abajo a la izquierda) sube POR DETRÁS de la barra, pasa por encima, baja POR DELANTE (primer seno), cruza POR DEBAJO de su propio tramo ascendente,
    // sube de nuevo POR DELANTE de la barra, pasa por encima y baja POR DETRÁS: sale el freno.
    const munter = MUNTER;
    const flat = munter.map(([x, y, zz]) => (zz === undefined || Math.abs(zz) < 1 ? [x, y, zz] : [x, y]));
    return [
      { height: 420, rope: 10, ropes: [{ ...A, path: flat }], arrows: [[[300, 120], [255, 160]], [[100, 120], [145, 160]]] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: munter }], arrows: [[[330, 150], [285, 120]]] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: munter }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter.slice(0, -3), [250, 250], [215, 300], [170, 345]] }], arrows: [[[95, 300], [95, 340]], [[300, 300], [230, 335]]] },
    ];
  })(),
  mula: (() => {
    const pear = { kind: 'path', d: 'M200 15c-60 0-85 40-80 90l8 70c4 30 140 30 144 0l8-70c5-50-20-90-80-90zm0 18c45 0 63 32 60 72l-8 66c-3 18-101 18-104 0l-8-66c-3-40 15-72 60-72z', fill: '#9aa1ab', stroke: '#5c626b' };
    const munter = MUNTER.slice(0, -3);
    // El freno baja, pasa un seno por detrás de la carga y lo cierra como un cote corredizo alrededor de ella.
    const behind = [[262, 262], [200, 278, -1], [130, 285, -1], [95, 290], [92, 312], [118, 318]];
    const slip = [[150, 312, 2], [200, 305, 2], [222, 290], [210, 268], [185, 270, 2], [175, 300, 2], [195, 330], [245, 340]];
    return [
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, [160, 320], [250, 330]] }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, ...slip] }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, ...slip.slice(0, -2), [180, 318, 3], [165, 300], [140, 312, 3], [185, 335], [240, 345]] }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, ...slip] }], arrows: [[[300, 300], [345, 280]]] },
    ];
  })(),
  guarda: (() => {
    // Dos mosquetones iguales pegados (en la foto se ven casi superpuestos, uno detrás del otro): se dibujan apenas corridos.
    const two = [anchorBar, biner(228, 22, 1.5), biner(192, 22, 1.5)];
    // Paso 2 (foto del manual y VDiff, ver refs/guarda.json): el seno entra por el ojo de los DOS mosquetones: un tramo pasa por DELANTE de las barras de abajo, da la vuelta adentro y baja por DETRAS.
    const clip = [[140, 345], [160, 290], [186, 208, 1], [194, 160, 1], [210, 130], [226, 160, -1], [232, 208, -1], [246, 290], [262, 345]];
    // Paso 3: del lado que no carga (derecha) se saca una gaza de la cuerda y se mete por el ojo del mosquetón de la izquierda (por delante), sin tocar el otro.
    const loopTail = [[246, 290], [236, 262], [200, 246, -0.5], [165, 226], [158, 208, 1], [156, 160, 1], [166, 122], [176, 160, -1], [172, 208, -1], [200, 250, 0.5], [250, 290], [275, 345]];
    return [
      { ...H, poles: two },
      { ...H, poles: two, ropes: [{ ...A, path: clip }] },
      { ...H, poles: two, ropes: [{ ...A, path: [...clip.slice(0, 7), ...loopTail] }] },
      { ...H, poles: two, ropes: [{ ...A, path: [...clip.slice(0, 7), ...loopTail] }], arrows: [[[100, 300], [100, 340]], [[310, 340], [310, 290]]] },
    ];
  })(),
  cornamusa: [
    { poles: [cleatBase, cleat], ropes: [{ ...A, path: [[-20, 280], [100, 250], [160, 200], [200, 185, 1], [255, 170], [262, 145, -1], [240, 115], [200, 112, -1], [140, 120], [135, 150, -1], [150, 180], [200, 190, 1], [260, 200], [300, 230]] }] },
    { poles: [cleatBase, cleat], ropes: [{ ...A, path: [[-20, 280], [100, 250], [160, 200], [200, 185, 1], [255, 170], [262, 145, -1], [240, 115], [200, 112, -1], [140, 120], [135, 150, -1], [150, 180], [200, 160, 1], [270, 125], [320, 135], [310, 165, -1], [280, 172], [200, 145, 2], [100, 122], [85, 150], [95, 170], [130, 175]] }] },
    { poles: [cleatBase, cleat], ropes: [{ ...A, path: [[-20, 280], [100, 250], [160, 200], [200, 185, 1], [255, 170], [262, 145, -1], [240, 115], [200, 112, -1], [140, 120], [135, 150, -1], [150, 180], [200, 160, 1], [270, 125], [320, 135], [310, 165, -1], [280, 172], [200, 145, 2], [100, 122], [85, 150], [95, 172], [130, 178], [200, 158, 3], [270, 135], [300, 120]] }] },
  ],
  'asiento-rappel': [
    { ...H, poles: body, ropes: [{ ...A, path: [[60, 345], [70, 200], [95, 110], [120, 95, -1], [125, 115], [100, 205], [95, 345]] }] },
    { ...H, poles: body, ropes: [{ ...A, path: [[180, 210], [195, 150], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112], [250, 118, 1], [200, 120, 1], [205, 150], [220, 210]] }] },
    { ...H, poles: body, ropes: [{ ...A, path: [[290, 112], [250, 118, 1], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112]], end: false }, { ...A, path: [[195, 122], [192, 160], [200, 190, -1], [205, 230, -1]] }, { ...A, path: [[205, 122], [208, 160], [200, 190, -1], [195, 230, -1]] }], arrows: [[[240, 200], [240, 260]]] },
    { ...H, poles: body, ropes: [{ ...A, path: [[290, 112], [250, 118, 1], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112]], end: false }, { ...A, path: [[195, 122], [192, 160], [200, 195, -1], [140, 215, -1], [112, 190], [118, 140], [140, 112, 0.5], [160, 125, 2]] }, { ...A, path: [[205, 122], [208, 160], [200, 195, -1], [260, 215, -1], [288, 190], [282, 140], [262, 112, 0.5], [240, 125, 2]] }] },
    { ...H, poles: [...body, biner(200, 108, 0.5)], ropes: [{ ...A, path: [[290, 112], [250, 118, 1], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112]], end: false }, { ...A, path: [[195, 122], [192, 160], [200, 195, -1], [140, 215, -1], [112, 190], [118, 140], [140, 112, 0.5], [130, 100, 2], [120, 85]] }, { ...A, path: [[205, 122], [208, 160], [200, 195, -1], [260, 215, -1], [288, 190], [282, 140], [262, 112, 0.5], [275, 100, 2], [285, 85]] }] },
  ],
  'silla-bombero': (() => {
    const cuffs = (a, b) => [[-20, 200], [100, 200], [160, 195], [200, 170, 0.5], [200 - a, 120], [200 - a * 1.6, 60 + (60 - a) / 2], [200 - a * 2, 140], [200 - a * 1.2, 205], [200, 175, -0.5], [200 + b * 1.2, 205], [200 + b * 2, 140], [200 + b * 1.6, 60 + (60 - b) / 2], [200 + b, 120], [200, 170, 0.5], [240, 195], [300, 200], [420, 200]];
    return [
      { ropes: [{ ...A, path: cuffs(35, 35) }] },
      { ropes: [{ ...A, path: cuffs(55, 40) }], arrows: [[[60, 60], [30, 40]], [[340, 70], [370, 50]]] },
      { ropes: [{ ...A, path: [...cuffs(55, 40).slice(0, 3), [140, 230], [120, 205, 1], [150, 180], ...cuffs(55, 40).slice(3, -3), [260, 180], [280, 205, 1], [260, 230], [300, 200], [420, 200]] }] },
    ];
  })(),
  cadena: [
    { width: 420, ropes: [{ ...A, path: chain(1) }], arrows: [[[150, 215], [120, 170]]] },
    { width: 420, ropes: [{ ...A, path: chain(2) }], arrows: [[[220, 215], [190, 170]]] },
    { width: 420, ropes: [{ ...A, path: chain(4) }] },
    { width: 420, ropes: [{ ...A, path: chain(4, true) }], arrows: [[[40, 100], [5, 100]]] },
  ],
  margarita: (() => {
    // Tres tramos paralelos (arriba, medio, abajo) unidos por dos senos: el izquierdo (medio-abajo) y el derecho (arriba-medio).
    const S = [[-20, 100], [340, 100], [378, 115], [378, 135], [340, 150], [40, 150], [14, 175], [40, 200], [420, 200]];
    // Cada punta da una vuelta (cote) alrededor del cuello de su seno: baja POR ARRIBA de los dos tramos del cuello, sube POR DEBAJO y sigue (la punta del seno queda afuera de la vuelta).
    const hitched = [
      [-20, 70], [90, 62], [135, 72], [135, 100, 2], [135, 150, 2], [135, 200, 2], [135, 232, 2], [118, 248, 2], [100, 234, -1], [100, 200, -1], [100, 150, -1], [100, 116, -1], [114, 103, -1], [150, 100, -1],
      [200, 100], [340, 100], [378, 115], [378, 135], [340, 150], [40, 150], [14, 175], [40, 200], [200, 200],
      [290, 200], [300, 184, -1], [300, 150, -1], [300, 100, -1], [300, 70, -1], [285, 56, 2], [265, 68, 2], [265, 100, 2], [265, 150, 2], [265, 200, 2], [265, 232, 2], [285, 238], [330, 230], [420, 230],
    ];
    return [
      { ropes: [{ ...A, path: S, end: false }] },
      { ropes: [{ ...A, path: hitched, end: false }] },
      { ropes: [{ ...A, path: hitched, end: false }], arrows: [[[40, 30], [5, 30]], [[355, 270], [395, 270]]] },
    ];
  })(),
};

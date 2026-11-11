import { A, B, G, OHZ, coilH, coilV, move, offset, overhand, rev } from '../helpers.mjs';

const H = { height: 340 };
const main = { ...B, path: [[200, -20], [200, 170], [200, 360]], end: false };
const X = 200;
// Vueltas del cordino, de abajo hacia arriba (izquierda adelante).
const wraps = (n, y = 230, pitch = 26, r = 24) => coilV({ x: X, y, n, pitch, r, up: true });

// Mosquetón (pera) dibujado como contorno.
const biner = (x, y, s = 1) => ({ kind: 'path', d: `M${x} ${y}c${-22 * s} 0 ${-30 * s} ${18 * s} ${-28 * s} ${40 * s}l${8 * s} ${70 * s}c${3 * s} ${18 * s} ${37 * s} ${18 * s} ${40 * s} 0l${8 * s} ${-70 * s}c${2 * s} ${-22 * s} ${-6 * s} ${-40 * s} ${-28 * s} ${-40 * s}zm0 ${10 * s}c${14 * s} 0 ${18 * s} ${14 * s} ${17 * s} ${30 * s}l${-7 * s} ${66 * s}c${-2 * s} ${10 * s} ${-18 * s} ${10 * s} ${-20 * s} 0l${-7 * s} ${-66 * s}c${-1 * s} ${-16 * s} ${3 * s} ${-30 * s} ${17 * s} ${-30 * s}z`, fill: '#9aa1ab', stroke: '#5c626b' });

// Ojo del anzuelo y tanza fina.
const eye = { kind: 'ring', x: 330, y: 150, r: 14, w: 7 };
const hook = { kind: 'path', d: 'M330 164 L330 250 C330 290 280 290 278 255 L278 240 L290 248 L290 256 C292 272 318 272 318 250 L318 164 Z', fill: '#9aa1ab', stroke: '#5c626b' };
const L = { rope: 6, zoom: [1.6, 270, 165] };
const LP = { rope: 8 };

export default {
  prusik: (() => {
    // Estructura leída de la foto del manual («Prusik knot.jpg», Commons; también «Three turn Prusik knot.jpg»):
    // UN solo cordino. Una pata sale por el costado, da vueltas a la cuerda hacia arriba, hace una D por la izquierda
    // (afuera de la cuerda), baja y vuelve con vueltas hacia el medio, donde sale la otra pata. Las dos patas
    // quedan juntas, entre los dos grupos de vueltas, y las vueltas no se cruzan entre sí.
    // Cada vuelta es un anillo visto de costado: solo se dibuja el tramo de adelante, que cruza la cuerda por ARRIBA;
    // el de atrás pasa por detrás de la cuerda y queda tapado, como en la foto del manual. Los anillos van apilados:
    // tres de cada lado de las patas. El de arriba sigue en la D, que baja por la izquierda hasta el último de abajo.
    const cord = ({ r = 22, gap = 18, legA = 178, legB = 222 } = {}) => {
      const band = (y, ...tail) => [[X - r, y], [X, y, 1], [X + r, y], ...tail];
      const yTop = legA - 2 * gap, yBot = legB + 2 * gap;
      const dx = X - r - 52;
      const d = [[X + r, yTop], [X, yTop, 1], [X - r, yTop], [X - r - 14, yTop - 10], [dx, yTop + 2], [dx - 6, (yTop + yBot) / 2], [dx, yBot - 2], [X - r - 14, yBot + 10], [X - r, yBot], [X, yBot, 1], [X + r, yBot]];
      return [
        { ...G, path: d, end: false },
        { ...G, path: band(legA - gap), end: false },
        { ...G, path: band(legA, [X + 120, legA]), end: false },
        { ...G, path: band(legB, [X + 120, legB]), end: false },
        { ...G, path: band(legB + gap), end: false },
      ];
    };
    const loose = cord({ r: 30, gap: 28, legA: 170, legB: 232 });
    const tight = cord({ r: 22, gap: 18, legA: 178, legB: 222 });
    return [
      // Paso 1: el anillo (dos tramos y el seno a la izquierda) se apoya POR DETRÁS de la cuerda, cruzándola de costado.
      { ...H, ropes: [main, { ...G, path: [[340, 214], [240, 214], [214, 214, 0], [200, 214, 1], [186, 214, 0], [160, 214], [110, 214], [62, 214], [44, 200], [62, 186], [110, 186], [160, 186], [186, 186, 0], [200, 186, 1], [214, 186, 0], [240, 186], [270, 186], [340, 186]], end: false }] },
      { ...H, ropes: [main, ...loose] },
      { ...H, ropes: [main, ...tight] },
      { ...H, ropes: [main, ...tight], arrows: [[[250, 270], [250, 330]]] },
    ];
  })(),
  machard: [
    { ...H, ropes: [main, { ...G, path: [[160, 300], [170, 250], [200, 230, -1], [230, 250], [240, 300]], end: false }], poles: [{ x: 170, y: 20, w: 60, h: 40, rx: 10, fill: '#c0c4ca', stroke: '#6b7079' }] },
    { ...H, ropes: [main, { ...G, path: [[175, 330], [180, 280], ...wraps(4, 250, 26, 22), [182, 140], [215, 300], [222, 330]], end: false }], poles: [{ x: 170, y: 20, w: 60, h: 40, rx: 10, fill: '#c0c4ca', stroke: '#6b7079' }] },
    { ...H, ropes: [main, { ...G, path: [[195, 300], [180, 280], ...wraps(4, 250, 26, 22), [182, 140], [215, 280], [205, 300]], end: false }], poles: [{ x: 170, y: 20, w: 60, h: 40, rx: 10, fill: '#c0c4ca', stroke: '#6b7079' }, biner(200, 290, 0.7)] },
    { ...H, ropes: [main, { ...G, path: [[195, 300], [180, 280], ...wraps(4, 250, 26, 22), [182, 140], [215, 280], [205, 300]], end: false }], poles: [{ x: 170, y: 20, w: 60, h: 40, rx: 10, fill: '#c0c4ca', stroke: '#6b7079' }, biner(200, 290, 0.7)], arrows: [[[150, 250], [150, 310]]] },
  ],
  klemheist: [
    { ...H, ropes: [main, { ...G, path: [[150, 340], [170, 270], ...wraps(4, 250, 26, 22), [180, 130], [200, 105], [215, 125], [215, 340]], end: false }] },
    { ...H, ropes: [main, { ...G, path: [[215, 300], [215, 280], ...wraps(4, 250, 26, 22), [178, 135], [195, 110], [218, 120, 1], [226, 160], [226, 260], [222, 330]], end: false }], arrows: [[[250, 290], [250, 160]]] },
    { ...H, ropes: [main, { ...G, path: [[178, 330], [180, 280], ...wraps(4, 250, 22, 22), [178, 155], [195, 130], [218, 140, 1], [226, 175], [220, 260], [205, 330]], end: false }], arrows: [[[250, 270], [250, 330]]] },
  ],
  bachmann: [
    { ...H, ropes: [main, { ...G, path: [[220, 330], [222, 250], [225, 195], [236, 170, -1], [250, 195], [246, 250], [240, 330]], end: false }], poles: [biner(235, 100)] },
    { ...H, ropes: [main, { ...G, path: [[222, 330], [225, 260], ...coilV({ x: 215, y: 240, n: 3, pitch: 26, r: 34, up: true }), [245, 140], [236, 120, -1]], end: false }], poles: [biner(235, 100)] },
    { ...H, ropes: [main, { ...G, path: [[222, 330], [225, 260], ...coilV({ x: 215, y: 240, n: 3, pitch: 26, r: 34, up: true }), [245, 140], [236, 120, -1]], end: false }], poles: [biner(235, 100)], arrows: [[[280, 250], [280, 320]], [[290, 180], [290, 110]]] },
  ],
  palomar: (() => {
    // Nudo simple hecho con la tanza doble; el seno (la punta del doble) queda libre y el anzuelo cuelga dentro del nudo.
    const hookAt = (x, y) => [{ kind: 'ring', x, y, r: 12, w: 6 }, { kind: 'path', d: `M${x} ${y + 12} L${x} ${y + 95} C${x} ${y + 135} ${x - 50} ${y + 135} ${x - 52} ${y + 100} L${x - 52} ${y + 85} L${x - 40} ${y + 93} L${x - 40} ${y + 101} C${x - 38} ${y + 117} ${x - 12} ${y + 117} ${x - 12} ${y + 95} L${x - 12} ${y + 12} Z`, fill: '#9aa1ab', stroke: '#5c626b' }];
    const oh = move(OHZ, 0, -5);
    const dbl = [...oh.slice(0, -1), [300, 86], [318, 98], [300, 110], ...rev(offset(oh.slice(0, -1), -12))];
    return [
      { ...LP, poles: [eye], ropes: [{ ...A, path: [[-20, 140], [200, 140], [300, 142], [322, 140, 1], [345, 150], [322, 160, -1], [300, 158], [200, 160], [-20, 160]], end: false }] },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: [{ ...A, path: dbl, end: false }] },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: [{ ...A, path: dbl, end: false }], arrows: [[[240, 385], [345, 300], [335, 125]]] },
      { ...LP, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [280, 150], [305, 140], [322, 140, 1], [342, 150], [322, 160, -1], [305, 160], [285, 175], [270, 195]] }], arrows: [[[60, 190], [10, 190]]] },
    ];
  })(),
  clinch: (() => {
    const thru = [[-20, 150], [200, 150], [300, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165]];
    const coil = coilH({ x: 280, y: 150, n: 5, pitch: 20, r: 14, from: 'bottom', left: true });
    return [
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, [200, 175], [150, 190]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...coil, [160, 175]] }] },
      // Por el lazo chico junto al ojo (por encima de una tanza y por debajo de la otra) y después por el lazo grande.
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...coil, [160, 175], [175, 210], [250, 212], [298, 190], [302, 165, 0.5], [301, 150, -0.5], [290, 132], [262, 126], [232, 132], [216, 150, 2], [212, 175], [210, 212, -0.5], [205, 245], [195, 270]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [292, 150], [318, 145, 1], [342, 150], [325, 162, -1], [305, 162], ...coilH({ x: 298, y: 150, n: 5, pitch: 7, r: 9, from: 'bottom', left: true }), [258, 140], [250, 125]] }], arrows: [[[60, 190], [10, 190]]] },
    ];
  })(),
  uni: (() => {
    const thru = [[-20, 150], [200, 150], [300, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165], [200, 165]];
    const loop = [[150, 168], [120, 175], [110, 215], [140, 235], [175, 205]];
    const coil = coilH({ x: 170, y: 158, n: 5, pitch: 20, r: 22, from: 'bottom' });
    return [
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, [130, 168]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...loop, [210, 185]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...loop, ...coil, [285, 185], [300, 210]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [292, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165], [290, 170], ...coilH({ x: 240, y: 158, n: 5, pitch: 9, r: 14, from: 'bottom' }), [300, 182], [310, 200]] }], arrows: [[[60, 190], [10, 190]]] },
    ];
  })(),
};

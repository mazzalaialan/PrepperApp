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
    const cord = ({ n = 1.5, r = 26, pitch = 26, legA = 178, legB = 204 } = {}) => {
      const upA = coilV({ x: X, y: legA, n, pitch, r, from: 'right', up: true });
      const topY = upA[upA.length - 1][1];
      const lowY = legB + n * pitch;
      const upB = coilV({ x: X, y: lowY, n, pitch, r, from: 'left', up: true });
      const dx = X - r - 52;
      return [[X + 120, legA], ...upA, [X - r - 14, topY - 12], [dx, topY + 2], [dx - 6, (topY + lowY) / 2], [dx, lowY - 2], [X - r - 14, lowY + 12], ...upB, [X + 120, legB]];
    };
    const loose = { ...G, path: cord({ n: 1.5, r: 30, pitch: 32 }), end: false };
    const tight = { ...G, path: cord({ n: 1.5, r: 22, pitch: 22, legA: 188, legB: 208 }), end: false };
    return [
      // Paso 1: el anillo (dos tramos y el seno a la izquierda) se apoya POR DETRÁS de la cuerda, cruzándola de costado.
      { ...H, ropes: [main, { ...G, path: [[340, 214], [240, 214], [214, 214, 0], [200, 214, 1], [186, 214, 0], [160, 214], [110, 214], [62, 214], [44, 200], [62, 186], [110, 186], [160, 186], [186, 186, 0], [200, 186, 1], [214, 186, 0], [240, 186], [270, 186], [340, 186]], end: false }] },
      { ...H, ropes: [main, loose] },
      { ...H, ropes: [main, tight] },
      { ...H, ropes: [main, tight], arrows: [[[250, 270], [250, 330]]] },
    ];
  })(),
  machard: (() => {
    // Estructura de las fotos del manual (machard-1 y machard-2): las vueltas suben en espiral alrededor de la cuerda;
    // una pata del anillo sale de la vuelta de abajo y la otra de la de arriba, que baja POR AFUERA de las vueltas
    // (por el costado derecho, sin cruzarlas) hasta juntarse con la primera en el mosquetón.
    // 3,5 vueltas: cuatro pasadas por delante y la última termina a la derecha, del lado por donde baja la pata.
    const coil = coilV({ x: X, y: 250, n: 3.5, pitch: 26, r: 22, up: true });
    const plate = { x: 170, y: 20, w: 60, h: 40, rx: 10, fill: '#c0c4ca', stroke: '#6b7079' };
    const open = { ...G, path: [[175, 330], [180, 280], ...coil, [232, 165], [236, 240], [232, 300], [228, 330]], end: false };
    const clip = { ...G, path: [[195, 300], [180, 280], ...coil, [232, 165], [236, 240], [222, 282], [205, 300]], end: false };
    return [
      { ...H, ropes: [main, { ...G, path: [[160, 300], [170, 250], [200, 230, -1], [230, 250], [240, 300]], end: false }], poles: [plate] },
      { ...H, ropes: [main, open], poles: [plate] },
      { ...H, ropes: [main, clip], poles: [plate, biner(200, 290, 0.7)] },
      { ...H, ropes: [main, clip], poles: [plate, biner(200, 290, 0.7)], arrows: [[[150, 250], [150, 310]]] },
    ];
  })(),
  klemheist: (() => {
    // Estructura de la foto del manual (klemheist-1) y de la descripción de ABOK 1762: el anillo da vueltas en espiral
    // y deja arriba una gaza corta (dibujada como un seno que sale hacia la derecha); la parte larga sale de la vuelta
    // de abajo, sube por afuera, pasa POR DENTRO de la gaza corta (sobre un tramo y bajo el otro) y se dobla hacia abajo:
    // al cargarla, tira de la gaza de arriba y aprieta las vueltas.
    const eyeT = [[200, 140, -1], [224, 133], [255, 132], [270, 135], [277, 142], [270, 149], [252, 151]];
    const coil = coilV({ x: X, y: 152, n: 4, pitch: 24, r: 22, from: 'right' });
    const top = [...eyeT, ...coil];
    return [
      { ...H, ropes: [main, { ...G, path: [...top, [232, 262], [236, 300], [236, 335]], end: false }] },
      { ...H, ropes: [main, { ...G, path: [...top, [236, 256], [242, 215], [242, 151, 1], [242, 132, -1], [242, 95]], end: false }], arrows: [[[300, 300], [300, 140]]] },
      { ...H, ropes: [main, { ...G, path: [...top, [236, 256], [242, 215], [242, 151, 1], [242, 132, -1], [246, 108], [264, 98], [286, 112], [292, 160], [288, 250], [272, 335]], end: false }], arrows: [[[320, 270], [320, 330]]] },
    ];
  })(),
  bachmann: (() => {
    // Foto del manual (bachmann-1): el anillo colgado del mosquetón da vueltas alrededor de la cuerda y del lomo del
    // mosquetón juntos; la gaza de carga sale de la vuelta de abajo, del mismo lado. 3,5 vueltas: la última termina a
    // la derecha y sube por dentro del mosquetón hasta donde está enganchado, sin cruzar las vueltas.
    const coil = coilV({ x: 215, y: 250, n: 3.5, pitch: 22, r: 34, up: true });
    const wrapped = { ...G, path: [[186, 330], [183, 270], ...coil, [252, 160], [242, 135], [236, 118, -1]], end: false };
    return [
      { ...H, ropes: [main, { ...G, path: [[220, 330], [222, 250], [225, 195], [236, 170, -1], [250, 195], [246, 250], [240, 330]], end: false }], poles: [biner(235, 100)] },
      { ...H, ropes: [main, wrapped], poles: [biner(235, 100)] },
      { ...H, ropes: [main, wrapped], poles: [biner(235, 100)], arrows: [[[290, 250], [290, 320]], [[300, 180], [300, 110]]] },
    ];
  })(),
  palomar: (() => {
    // Nudo simple hecho con la tanza doble; el seno (la punta del doble) queda libre y el anzuelo cuelga dentro del nudo.
    const hookAt = (x, y) => [{ kind: 'ring', x, y, r: 12, w: 6 }, { kind: 'path', d: `M${x} ${y + 12} L${x} ${y + 95} C${x} ${y + 135} ${x - 50} ${y + 135} ${x - 52} ${y + 100} L${x - 52} ${y + 85} L${x - 40} ${y + 93} L${x - 40} ${y + 101} C${x - 38} ${y + 117} ${x - 12} ${y + 117} ${x - 12} ${y + 95} L${x - 12} ${y + 12} Z`, fill: '#9aa1ab', stroke: '#5c626b' }];
    const oh = move(OHZ, 0, -5);
    const dbl = [...oh.slice(0, -1), [300, 86], [318, 98], [300, 110], ...rev(offset(oh.slice(0, -1), -12))];
    return [
      { ...LP, poles: [eye], ropes: [{ ...A, path: [[-20, 140], [200, 140], [300, 142], [322, 140, 1], [345, 150], [322, 160, -1], [300, 158], [200, 160], [-20, 160]], end: false }] },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: [{ ...A, path: dbl, end: false }] },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: [{ ...A, path: dbl, end: false }], arrows: [[[240, 385], [345, 300], [335, 125]]] },
      // Paso 4: el seno ya pasó por encima del anzuelo y abraza la pata, debajo del ojo (foto del manual palomar-1,
      // último cuadro): falta solo ajustar tirando de las dos tanzas hacia la izquierda.
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: [{ ...A, path: [...oh.slice(0, -1), [318, 130], [330, 230], [290, 318], [214, 326, 1], [186, 330], [180, 342], [214, 346, -1], [300, 338], [344, 232], [330, 120], ...rev(offset(oh.slice(0, -1), -12))], end: false }], arrows: [[[60, 250], [10, 250]]] },
    ];
  })(),
  clinch: (() => {
    const thru = [[-20, 150], [200, 150], [300, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165]];
    const coil = coilH({ x: 280, y: 150, n: 5, pitch: 20, r: 14, from: 'bottom', left: true });
    return [
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, [200, 175], [150, 190]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...coil, [160, 175]] }] },
      // Por el lazo chico junto al ojo (por encima de una tanza y por debajo de la otra) y después por el lazo grande.
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...coil, [160, 175], [175, 210], [250, 212], [298, 190], [302, 165, 0.5], [301, 150, -0.5], [290, 132], [264, 126], [244, 132], [236, 150, 2], [232, 175], [228, 212, -0.5], [222, 245], [212, 270]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [292, 150], [318, 145, 1], [342, 150], [325, 162, -1], [305, 162], ...coilH({ x: 298, y: 150, n: 5, pitch: 7, r: 9, from: 'bottom', left: true }), [258, 140], [250, 125]] }], arrows: [[[60, 190], [10, 190]]] },
    ];
  })(),
  uni: (() => {
    // Estructura de la foto del manual (uni-1): la punta vuelve junto a la tanza y hace una gaza que se cruza por ENCIMA
    // de las dos tanzas cerca del ojo, con el arco colgando por debajo; las vueltas rodean las dos tanzas DENTRO de esa
    // gaza (entre las tanzas y el arco), alejándose del ojo. Antes la gaza quedaba al costado de las vueltas, sin
    // enlazarse con ellas, y el nudo se habría desarmado.
    const thru = [[-20, 150], [200, 150], [300, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165], [200, 165]];
    const loop = [[130, 167], [104, 192], [122, 228], [200, 236], [272, 228], [290, 198], [284, 168, 1], [280, 150, 1], [270, 128]];
    const coil = coilH({ x: 258, y: 158, n: 5, pitch: 17, r: 20, from: 'top', left: true });
    return [
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, [130, 168]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...loop, [250, 112]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...loop, ...coil, [160, 190], [150, 210]] }] },
      { ...L, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [292, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165], [292, 166], [289, 150, 1], [285, 143], ...coilH({ x: 282, y: 158, n: 5, pitch: 8, r: 14, from: 'top', left: true }), [232, 178], [222, 198]] }], arrows: [[[60, 190], [10, 190]]] },
    ];
  })(),
};

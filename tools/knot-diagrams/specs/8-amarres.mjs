import { A, coilAlong, coilH, coilV } from '../helpers.mjs';

const H = { height: 340 };

/**
 * Ballestrinque verificado (BAAB, refs/ballestrinque.json; el mismo de specs/5-cotes.mjs «cloveParts») sobre un palo.
 * Coordenadas del palo: px = distancia al eje (el firme entra por px < 0, el chicote sale por px > 0), py = a lo largo del palo.
 * Con (cx, cy) el centro, (ux, uy) la dirección del eje del palo y `flip` invierte de qué lado entra el firme.
 * Devuelve { up, down, tuck } ya colocados; el firme llega al primer punto de `up` y el chicote sale por el último de `tuck`.
 */
const cloveAt = (cx, cy, [ux, uy], { r = 30, h = 50, flip = false } = {}) => {
  const f = (a) => (a * h) / 100;
  const raw = {
    up: [[-r, 0, 1], [0, f(-25), 1], [r, f(-50), 1], [r + 7, f(-54)], [0, f(-62), -1], [-r, f(-58), 0]],
    down: [[0, f(-4), 2], [r, f(50), 2], [r + 7, f(54)], [0, f(58), -1], [-r, f(55), 0]],
    tuck: [[0, f(40), 1], [45, f(18), 1]],
  };
  const s = flip ? -1 : 1;
  const put = ([px, py, zz]) => [cx + py * ux + s * px * uy, cy + py * uy - s * px * ux, ...(zz === undefined ? [] : [zz])];
  return { up: raw.up.map(put), down: raw.down.map(put), tuck: raw.tuck.map(put), put };
};
/** Ballestrinque completo (firme + vueltas + chicote). */
const cloveFull = (cx, cy, axis, opts) => {
  const c = cloveAt(cx, cy, axis, opts);
  return [...c.up, ...c.down, ...c.tuck];
};
/** Punta libre con su tapa: una cuerda corta aparte que termina en el extremo (p0) y se pega al inicio de la cuerda principal. */
const tailCap = (p0, p1) => ({ ...A, path: [p1, p0] });

const wood = (x, y, w, h, rotate = 0) => ({ x, y, w, h, rx: Math.min(w, h) / 2.5, rotate });
const VERT = [0, 1], HORIZ = [1, 0];

// ---------------------------------------------------------------------------------------------------------------
// ATADURA CUADRADA (FM 5-125, fig. 2-36, dominio público; fotos de Commons «Lashing square.jpg», CC BY-SA 3.0, y «Square Lashing.jpg», CC BY-SA 4.0).
// Cruz: el palo horizontal queda por delante del vertical (eje x = 200); el horizontal tiene el eje en y = 170.
//  1) Ballestrinque en el palo vertical, justo debajo del cruce.
//  2) Cuatro vueltas completas alrededor de los dos palos: por delante del horizontal a cada lado del vertical, por detrás del vertical
//     arriba y por delante del vertical abajo (así la vuelta abraza al vertical y aprieta al horizontal contra él); cada vuelta
//     queda por fuera de la anterior sobre el horizontal.
//  3) Dos vueltas de ajuste (frapeo): rodean al vertical pegadas al cruce, por dentro de las vueltas: por delante del vertical arriba,
//     por detrás abajo, y por delante del horizontal a los costados.
//  4) Ballestrinque final en el palo OPUESTO al del comienzo (el horizontal), al lado de las vueltas.
// ---------------------------------------------------------------------------------------------------------------
const vert = wood(176, -10, 48, 380);
const horiz = wood(-10, 146, 420, 48);
const CROSS = [vert, horiz]; // el horizontal se dibuja después: queda por delante
const HS = { height: 360 };

const startClove = cloveAt(200, 312, VERT, { r: 32, h: 44 });
// Chicote corto del comienzo (a la izquierda) y salida del ballestrinque hacia la derecha; sube por el costado derecho.
const sqStart = [[134, 316, 0], ...startClove.up, ...startClove.down, ...startClove.tuck, [263, 313], [264, 282], [248, 240], [232, 206]];
// Una vuelta alrededor de los dos palos. i = 0 es la que abraza al cruce; cada una queda por fuera de la anterior.
// Sentido: sube por la derecha, cruza por arriba hacia la izquierda, baja por la izquierda, cruza por abajo hacia la derecha.
// topZ/botZ: profundidad de la parte de arriba y de abajo respecto del palo vertical (-1 detrás, 1 y 2 delante).
const sqTurn = (i, topZ, botZ) => {
  const d = i * 12, R = 232 + d, L = 168 - d, T = 137 - d, B = 203 + d;
  return [[R, B - 6, 0], [R, 170, 1], [R, T + 8, 0], [R - 9, T, topZ], [200, T - 3, topZ], [L + 9, T, topZ], [L, T + 8, 0], [L, 170, 1], [L, B - 6, 0], [L + 9, B, botZ], [200, B + 3, botZ]];
};
// Cuatro vueltas: arriba por detrás del vertical, abajo por delante.
const sqWraps = (n) => Array.from({ length: n }, (_, i) => sqTurn(i, -1, 1)).flat();
// Frapeo (2 vueltas de ajuste), por fuera de las anteriores y con la inclinación contraria: arriba por delante del vertical,
// abajo por detrás; así abrazan las vueltas y las aprietan contra los palos.
const sqFrap = (n, from = 4) => Array.from({ length: n }, (_, j) => sqTurn(from + j, 2, -1)).flat();
const endClove = cloveAt(352, 170, HORIZ, { r: 32, h: 44 });
const sqEnd = [[306, 268, 2], [352, 262, 2], [352, 214], ...endClove.up, ...endClove.down, ...endClove.tuck];
const sqRopes = (...parts) => [{ ...A, path: parts.flat() }, tailCap([134, 316], [150, 316])];

// ---------------------------------------------------------------------------------------------------------------
// ATADURA DE TIJERA (FM 5-125, 2-24/2-25, fig. 2-37, dominio público; Commons «Shear-lashing-2pole.JPG», Lwan98, CC BY-SA 3.0;
// «Shear lashing 0 Thumb.jpg», Zaripov999, CC BY-SA 4.0).
//  1) Los dos palos juntos (un poco separados); ballestrinque en uno, cerca de la punta.
//  2) Ocho vueltas apretadas alrededor de los dos palos.
//  3) Dos vueltas de ajuste (frapeo) ENTRE los palos, alrededor de las vueltas: la cuerda pasa por la rendija, por delante de las vueltas
//     (el tramo vertical que se ve), vuelve por detrás y otra vez por la rendija; se repite.
//  4) Ballestrinque final en el palo OPUESTO al del comienzo.
// ---------------------------------------------------------------------------------------------------------------
const X = [wood(-30, 146, 460, 48, 35), wood(-30, 146, 460, 48, -35)]; // palos en X (diagonal)
const SH = { height: 400 };
const shPoles = [wood(138, -10, 44, 420), wood(218, -10, 44, 420)]; // ejes en x = 160 y 240; rendija de 36
const shClove = cloveAt(160, 100, VERT, { r: 30, h: 50 });
const shStart = [[96, 104, 0], ...shClove.up, ...shClove.down, ...shClove.tuck, [232, 108], [270, 120]];
const shWraps = coilV({ x: 200, y: 120, n: 8, pitch: 15, r: 70, from: 'right' });
// Frapeo: dos vueltas por la rendija (x = 200). Cada una: baja pegada por detrás, sube por detrás, cruza arriba y baja por delante.
const shFrap = [
  [262, 244, 0], [222, 262, 0], [210, 268, -1], [210, 200, -1], [210, 120, -1], [208, 98, -1], [200, 92, 0], [190, 100, 1], [190, 150, 1], [190, 220, 1], [190, 252, 1],
  [196, 268, -1], [190, 240, -1], [190, 150, -1], [190, 100, -1], [198, 92, 0], [210, 100, 1], [210, 150, 1], [210, 220, 1], [210, 254, 1], [212, 284, 0],
];
const shEndClove = cloveAt(240, 330, VERT, { r: 30, h: 50 });
const shEnd = [[200, 308], [178, 330], ...shEndClove.up, ...shEndClove.down, ...shEndClove.tuck];
const shRopes = (...parts) => [{ ...A, path: parts.flat() }, tailCap([96, 104], [112, 102])];

// ---------------------------------------------------------------------------------------------------------------
// ATADURA DE TRÍPODE (FM 5-125, 5-5/5-6, fig. 5-4; dominio público). Tres palos, el del medio al revés (las puntas del lado contrario).
//  Método II (fig. 5-4 B, la que usa la app): ballestrinque en un palo de afuera y vueltas entretejidas («por encima del palo del medio,
//  por debajo y alrededor del de afuera, por debajo del del medio, por encima y alrededor del primero»: 8 vueltas) y ballestrinque en el
//  palo de afuera. Método I (fig. 5-4 A): 8 vueltas simples, dos vueltas de ajuste entre cada par de palos y ballestrinque en el palo del medio.
//  Lo dibujado: vueltas entretejidas (Método II) + dos vueltas de ajuste en cada hueco (como en el Método I y en las guías de scouts)
//  + ballestrinque final en el OTRO palo de afuera (el FM lo hace así en el Método II; knots3d: «buena forma»).
// ---------------------------------------------------------------------------------------------------------------
const TH = { height: 420 };
const tri = [wood(110, -10, 40, 440), wood(180, -10, 40, 440), wood(250, -10, 40, 440)]; // ejes en x = 130, 200, 270
const trClove = cloveAt(130, 96, VERT, { r: 30, h: 50 });
// Una vuelta entretejida: va por encima del 1.º, por debajo del 2.º, por encima del 3.º, da la vuelta al 3.º y vuelve alternando; da la vuelta al 1.º.
const trTurn = (y, first = false) => [
  ...(first ? [] : [[130, y, 1], [165, y + 4, 1]]),
  [200, y, -1], [235, y + 4, -1], [270, y, 1], [300, y + 8], [270, y + 12, -1], [235, y + 9, 1], [200, y + 12, 1], [165, y + 9, -1], [130, y + 12, -1], [100, y + 19],
];
const trWeave = (n) => Array.from({ length: n }, (_, i) => trTurn(116 + i * 22, i === 0)).flat();
const trStart = [[60, 104, 0], ...trClove.up, ...trClove.down, ...trClove.tuck];
// Frapeo: dos vueltas en cada hueco (x = 165 y 235): bajan por delante de las vueltas y vuelven por detrás pasando por el hueco.
const trRing = (xb, xf) => [[xb, 304, -1], [xb, 200, -1], [xb, 110, -1], [(xb + xf) / 2, 98, 0], [xf, 106, 1], [xf, 200, 1], [xf, 292, 1], [(xb + xf) / 2, 304, -1]];
const trFrap = [
  [96, 292, 0], [130, 300, 0],
  ...trRing(174, 156), ...trRing(156, 174).slice(0, -1), [165, 312, -1], [200, 314, -1], [226, 312, -1],
  ...trRing(244, 226), ...trRing(226, 244).slice(0, -1),
];
const trEndClove = cloveAt(270, 352, VERT, { r: 30, h: 50 });
const trEnd = [[236, 322], [214, 346], ...trEndClove.up, ...trEndClove.down, ...trEndClove.tuck];
const trRopes = (...parts) => [{ ...A, path: parts.flat() }, tailCap([60, 104], [78, 102])];

export default {
  'atadura-cuadrada': [
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, [[232, 200, 1], [232, 150, 1], [232, 100, 1]]), arrows: [[[290, 270], [290, 200]]] },
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, sqWraps(4)) },
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, sqWraps(4), sqFrap(2)) },
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, sqWraps(4), sqFrap(2), sqEnd) },
  ],
  'atadura-tijera': [
    { ...SH, poles: shPoles, ropes: shRopes(shStart.slice(0, -1)) },
    { ...SH, poles: shPoles, ropes: shRopes(shStart, shWraps) },
    { ...SH, poles: shPoles, ropes: shRopes(shStart, shWraps, shFrap, shEnd), arrows: [[[150, 372], [110, 395]], [[250, 372], [290, 395]]] },
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
    const ring = (e) => [[104 - e, 236 + e], [125, 262 + e, 3], [170, 266 + e, 3], [222, 262 + e, 3], [244 + e, 250], [250 + e, 170, -1], [244 + e, 88], [222, 76 - e, 3], [170, 72 - e, 3], [125, 76 - e, 3], [104 - e, 92]];
    const frap = [...ring(0), ...ring(9), [92, 108]];
    // Ballestrinque final en el brazo de arriba a la izquierda, al lado de donde termina el ajuste.
    const dClove = cloveAt(64, 74, [Math.cos((35 * Math.PI) / 180), Math.sin((35 * Math.PI) / 180)], { r: 30, h: 46 }); // eje del palo que sube a la izquierda
    const clove = [[84, 118, 3], [58, 118, 3], ...dClove.up, ...dClove.down, ...dClove.tuck.map(([x, y, zz]) => [x, y, (zz ?? 0) * 3])];
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
    { ...TH, poles: tri },
    { ...TH, poles: tri, ropes: trRopes(trStart, trWeave(8)) },
    { ...TH, poles: tri, ropes: trRopes(trStart, trWeave(8), trFrap, trEnd), arrows: [[[110, 395], [70, 415]], [[290, 395], [330, 415]]] },
  ],
};

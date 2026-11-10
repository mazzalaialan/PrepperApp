import { A, B, G, coilAlong, coilH, coilV, move, rev } from '../helpers.mjs';

// Palo vertical (x 170–220, eje en 195).
const post = { x: 170, y: -10, w: 50, h: 320 };
const PX = 195, R = 34;

/**
 * Ballestrinque transcrito de la foto "Clove Hitch - ABoK 11 - USCG.jpg" (USCG PTC Developer, CC0), palo vertical, cruce por cruce:
 * el firme entra por delante, sube en diagonal (adelante), pasa por detrás y vuelve al frente bajando en diagonal POR ENCIMA
 * del firme (la X); da la vuelta por detrás y sale por debajo de esa segunda diagonal hacia el lado contrario (chicote).
 * Cruces cuerda con cuerda (firme a punta): ABAJO, ARRIBA, ARRIBA, ABAJO; por delante una X, por detrás dos pasadas paralelas.
 * Con el palo da el mismo enlace que la referencia (lk 2; invariantes 12/1 3/1 3/1 4/1 4/1 1/1). Ver tambien
 * "Wiki Clove-of-Crossed-Turn-Family 2.png" (Thetreespyder, CC BY-SA 4.0).
 * Parte de la X (cx, cy: centro; r: radio; h: alto de las dos vueltas).
 */
const cloveParts = ({ cx = PX, cy = 150, r = R, h = 100 } = {}) => {
  const f = (a) => cy + a * h / 100;
  const up = [[-20, cy], [cx - r - 75, cy], [cx - r, cy, 1], [cx, f(-25), 1], [cx + r, f(-50), 1], [cx + r + 7, f(-54)], [cx, f(-62), -1], [cx - r, f(-58), 0]];
  const down = [[cx, f(-4), 2], [cx + r, f(50), 2], [cx + r + 7, f(54)], [cx, f(58), -1], [cx - r, f(55), 0]];
  const tuck = [[cx, f(40), 1], [cx + 45, f(18), 1], [cx + 105, f(10)], [cx + 185, f(10)]];
  return { up, down, tuck, cx, cy, r, h, f };
};
const cl = cloveParts();
const clove1 = [...cl.up, ...cl.down.slice(0, 2)];
const clove2 = [...cl.up, ...cl.down];
const cloveEnd = cl.tuck;

// Vuelta redonda: el firme llega por la izquierda (y = 80), da dos pasadas al palo y el chicote vuelve a la izquierda.
const rtCoil = (pitch) => [[-20, 80], [100, 80], ...coilV({ x: PX, y: 80, n: 2, pitch, r: R })];
/**
 * Medio cote del chicote alrededor de un firme horizontal (a la altura y), transcrito de "Two half hitches 2.jpg" (dominio publico)
 * y de la foto "Anderthalb Rundtoern mit zwei halben Schlaegen.jpg" (Markus Baerlocher, dominio publico). Es un rulo con UN cruce
 * propio con el firme enhebrado por dentro: 3 cruces. El chicote llega desde el palo por debajo del firme (a y + d), sube POR ARRIBA
 * del firme (en xc - w), da la vuelta por encima, baja POR DEBAJO del firme (en xc) y pasa POR DEBAJO de su propio tramo que
 * llega (en xc, y + d); sigue hacia la izquierda para el siguiente cote. `xc`: donde el chicote cruza su propio tramo.
 */
export const hitch = (xc, y, d = 52, w = 30) => {
  const x0 = xc - w;
  return [
    [xc + 8, y + d], [xc - 10, y + d - 2], [x0 + 10, y + d - 12], [x0 + 2, y + 22, 1], [x0, y - 2, 1], [x0 + 3, y - 26, 1], [x0 + w / 2, y - 36, 1],
    [xc - 2, y - 26, 0], [xc + 2, y - 4, -1], [xc + 2, y + 18, -1], [xc, y + d + 6, -1], [xc - 6, y + d + 24, 0],
  ];
};
/** Tramo que une dos cotes: pasa por debajo del cote anterior y sube al nivel del tramo que llega al siguiente. */
const link = (xc, y, d = 52, s = 58) => [[xc - 22, y + d + 28], [xc - 32, y + d + 16], [xc - 42, y + d + 5]];

export default {
  ballestrinque: [
    { poles: [post], ropes: [{ ...A, path: clove1 }], arrows: [[[262, 205], [250, 238], [205, 250]]] },
    { poles: [post], ropes: [{ ...A, path: [...clove2, [cl.cx - cl.r - 22, cl.f(60)]] }], arrows: [[[118, 240], [175, 232], [236, 200]]] },
    { poles: [post], ropes: [{ ...A, path: [...clove2, ...cloveEnd] }] },
    (() => {
      // En un mosquetón: el mismo ballestrinque sobre la barra larga (lomo) del mosquetón.
      const biner = { kind: 'path', d: 'M200 20c-50 0-70 35-66 75l6 120c3 50 117 50 120 0l6-120c4-40-16-75-66-75zm0 16c38 0 52 28 50 60l-6 117c-2 34-86 34-88 0l-6-117c-2-32 12-60 50-60z', fill: '#9aa1ab', stroke: '#5c626b' };
      const m = cloveParts({ cx: 143, cy: 160, r: 24, h: 92 });
      const c = [...m.up, ...m.down, ...m.tuck];
      return { height: 320, poles: [{ x: 160, y: 0, w: 80, h: 14, rx: 5, fill: '#8f949b', stroke: '#585c62' }, biner], ropes: [{ ...A, path: c }] };
    })(),
  ],
  'vuelta-redonda': (() => {
    const base = rtCoil(32); // termina en (161, 144)
    const h1 = hitch(118, 80, 64), h2 = hitch(60, 80, 64);
    return [
      { poles: [post], ropes: [{ ...A, path: [...base, [140, 144], [100, 144]] }], arrows: [[[110, 190], [70, 190]]] },
      { poles: [post], ropes: [{ ...A, path: [...base, [140, 144], ...h1, [96, 176], [60, 184]] }], arrows: [[[70, 225], [30, 215]]] },
      { poles: [post], ropes: [{ ...A, path: [...base, [140, 144], ...h1, ...link(118, 80, 64), ...h2, [36, 176], [24, 186]] }], arrows: [[[60, 30], [120, 30]]] },
    ];
  })(),
  alondra: [
    { ropes: [{ ...G, path: [[-20, 115], [120, 115], [200, 115, -1], [270, 118], [305, 150], [270, 182], [200, 185, -1], [120, 185], [-20, 185]], end: false }], poles: [{ ...post, x: 175, w: 50 }],
      arrows: [[[320, 150], [350, 150]]] },
    { ropes: [{ ...G, path: [[-20, 140], [100, 140], [150, 145, -0.5], [195, 148, -1], [231, 145, -1], [240, 140], [248, 120], [200, 108, 1], [150, 110], [126, 150, 1], [150, 192], [200, 196, 1], [248, 184], [240, 165], [231, 162, -1], [195, 160, -1], [150, 162, -0.5], [100, 168], [-20, 168]], end: false }], poles: [{ ...post, x: 175, w: 50 }],
      arrows: [[[60, 215], [10, 215]]] },
  ],
  'medios-cotes': (() => {
    // Firme a la izquierda (y = 80); una vuelta al poste; los cotes van sobre el firme, uno tras otro hacia la izquierda.
    const turn = (ex) => [[-20, 80], [100, 80], ...coilV({ x: PX, y: 80, n: 1, pitch: 50, r: R }).slice(0, 7), [168, 128, -1], [ex, 132]];
    const h1 = hitch(134, 80), h2 = hitch(76, 80), h3 = hitch(152, 80), h4 = hitch(94, 80);
    return [
      { poles: [post], ropes: [{ ...A, path: [...turn(150), ...h1, [100, 160], [66, 168]] }] },
      { poles: [post], ropes: [{ ...A, path: [...turn(150), ...h1, ...link(134, 80), ...h2, [52, 160], [32, 170]] }] },
      { poles: [post], ropes: [{ ...A, path: [...turn(160), ...h3, ...link(152, 80), ...h4, [70, 160], [50, 170]] }], arrows: [[[60, 215], [120, 215]]] },
    ];
  })(),
  constrictor: (() => {
    /**
     * Transcrito de "Constrictor-ABOK-1249.jpg" y "Constrictor-knot-Marlinespike-hitches.jpg" (David J. Fred, CC BY-SA 2.5):
     * igual que el ballestrinque hasta la segunda diagonal; el chicote sube por delante y pasa por DEBAJO de las dos ramas de
     * la X (la diagonal que baja y la que sube) y sale arriba: las dos puntas quedan juntas formando un simple bajo la vuelta montada.
     * Invariantes con el palo: 4/1 1/1 7/1 4/1 52/1 11/1.
     */
    const m = cloveParts({ h: 116 });
    const c1 = [...m.up, ...m.down.slice(0, 2)], c2 = [...m.up, ...m.down];
    const end = [[m.cx - 4, m.f(42), 0.5], [m.cx + 6, m.f(14), 0.5], [m.cx + 15, m.f(-20), 0.5], [m.cx + 14, m.f(-48), 0.5], [m.cx + 6, m.f(-82), 0.5], [m.cx + 12, m.f(-102)], [m.cx + 60, m.f(-106)], [m.cx + 185, m.f(-106)]];
    return [
      { poles: [post], ropes: [{ ...A, path: c1 }], arrows: [[[262, 215], [250, 248], [205, 262]]] },
      { poles: [post], ropes: [{ ...A, path: [...c2, [m.cx - m.r - 22, m.f(60)]] }], arrows: [[[118, 250], [160, 200], [205, 140]]] },
      { poles: [post], ropes: [{ ...A, path: [...c2, ...end] }] },
    ];
  })(),
  ancla: (() => {
    /**
     * Transcrito de "AnchorBend HowTo.jpg" (CC BY-SA 3.0) y "Roringstek.jpg" (dominio publico): dos vueltas a la barra, el chicote
     * rodea el firme y pasa a lo largo de la barra POR DEBAJO de las dos vueltas (entre ellas y el aro) y sale del otro lado; al final
     * un medio cote sobre el firme. Argolla arriba; la barra es su parte de abajo (y = 150).
     */
    const ring = { kind: 'ring', x: 200, y: 88, r: 62, w: 13 };
    const turns = [[128, 345], [140, 285], [146, 225], ...coilH({ x: 150, y: 150, n: 2, pitch: 46, r: 28, from: 'bottom' })];
    // El chicote baja, rodea el firme (por detras y por delante), vuelve por abajo y entra por la derecha a lo largo de la barra.
    const tuck = [[248, 200], [240, 236], [200, 258], [165, 262], [134, 262, -1], [104, 252], [98, 236], [110, 226, 1], [143, 222, 1], [170, 208], [200, 206], [262, 202], [270, 176], [262, 150, 0.5], [240, 150, 0.5], [200, 150, 0.5], [160, 150, 0.5], [124, 152, 0.5]];
    // Medio cote sobre el firme (el mismo `hitch`, girado: el firme va casi vertical), mas abajo; el chicote baja por la izquierda.
    const half = [[96, 166], [66, 198], [60, 250], ...hitch(0, 0, 76).map(([x, y, z]) => (z === undefined ? [137 - y, 298 - x] : [137 - y, 298 - x, z])), [34, 326]];
    return [
      { height: 340, poles: [ring], ropes: [{ ...A, path: [...turns, [250, 205], [252, 245]] }] },
      { height: 340, poles: [ring], ropes: [{ ...A, path: [...turns, ...tuck] }] },
      { height: 340, poles: [ring], ropes: [{ ...A, path: [...turns, ...tuck, ...half] }] },
    ];
  })(),
  lenador: (() => {
    /**
     * Transcrito de "Timber Hitch HowTo.jpg" (CC BY-SA 3.0) y "Timber Hitch (PSF).png" (dominio publico): la cuerda rodea el tronco
     * (el firme pasa por detras y la vuelta vuelve por delante), el chicote rodea el firme (collar) y se enrosca tres veces sobre el
     * tramo de la gaza que vuelve por delante del tronco (entre ese tramo y el tronco queda la parte de atras de cada vuelta).
     */
    const log = { x: 20, y: 190, w: 360, h: 70, rx: 26 };
    // Firme (z = -1 detras del tronco), vuelta por abajo y tramo que vuelve por delante (recto, de (212,218) a (160,92)).
    const back = [[114, 110], [120, 150], [140, 196, -1], [170, 236, -1], [198, 262, -1], [214, 274], [232, 262]];
    const strand = [[226, 246, 1], [218, 228, 1], [212, 218, 1], [199, 186, 1], [186, 155, 1], [173, 124, 1], [160, 92, 1]];
    // Collar: el chicote sube, pasa por detras del firme, da la vuelta y vuelve por delante del firme.
    const collar = [[153, 68, 1], [134, 54], [112, 52, -0.5], [88, 60, -0.5], [74, 84], [82, 108], [100, 118], [114, 112, 0.5]];
    // Enroscado: tres vueltas alrededor del tramo, de arriba hacia abajo. Adelante z = 2, atras z = 0,5 (entre el tramo y el tronco).
    const dog = coilAlong([160, 92], [212, 218], 3, 20).map(([x, y, zz]) => [x, y, zz > 0 ? 2 : 0.5]);
    const tipEnd = [[168, 232, 0.5], [138, 236, 0.5]];
    return [
      { poles: [log], ropes: [{ ...A, path: [[110, -20], [112, 60], ...back, ...strand, [152, 64]] }], arrows: [[[250, 215], [268, 262], [236, 292], [196, 296]]] },
      { poles: [log], ropes: [{ ...A, path: [[110, -20], [112, 60], ...back, ...strand, ...collar, [141, 100, 0.5], [140, 122, 0.5]] }], arrows: [[[147, 140], [154, 160], [164, 182]]] },
      { poles: [log], ropes: [{ ...A, path: [[110, -20], [112, 60], ...back, ...strand, ...collar, ...dog, ...tipEnd] }], arrows: [[[60, 40], [60, 5]]] },
      (() => {
        // Para arrastrar: el firme (la cuerda de tiro) viene de la derecha, da un cote al tronco cerca de la punta y sigue hasta el nudo.
        const tow = [[440, 176, 0.5], [390, 176, 0.5], [345, 176, 0.5], [326, 190, 0.5], [322, 202, 1], [320, 232, 1], [324, 262, 1], [336, 277], [352, 268], [354, 240, -1], [353, 198, -1], [351, 172, -0.5], [336, 140], [290, 96], [236, 52], [176, 24], [128, 20], [112, 46]];
        return {
          poles: [log],
          ropes: [{ ...A, path: [...tow, [112, 70], ...back, ...strand, ...collar, ...dog, ...tipEnd] }],
          arrows: [[[335, 96], [382, 96]]],
        };
      })(),
    ];
  })(),
  tensor: (() => {
    /**
     * Referencia: "TautlineHitch-ABOK-1800.jpg" (David J. Fred, CC BY-SA 2.5; es la variante ABOK 1800, de la 1856 no hay figura libre).
     * La gaza rodea la estaca y el chicote vuelve junto al firme; dos vueltas al firme hacia la estaca y una tercera, afuera, que es un
     * medio cote (el chicote pasa por dentro de esa vuelta). Las vueltas llevan mas paso y radio para que se lean.
     */
    const stake = { x: 320, y: 60, w: 34, h: 190, rx: 8 };
    const back = [[-20, 110], [120, 110], [300, 110], [337, 98, -1], [372, 118], [372, 165], [337, 182, 1], [300, 171]];
    const leg = [[230, 171], [196, 166], [186, 150]];
    const two = coilH({ x: 188, y: 110, n: 2, pitch: 46, r: 26, from: 'bottom' });
    // Despues de las dos vueltas el chicote baja (cruza la pata de la gaza) y vuelve por debajo hacia la izquierda.
    const drop = [[288, 152], [291, 176], [280, 200]];
    return [
      { poles: [stake], ropes: [{ ...A, path: [...back, [210, 172], [180, 172]] }], arrows: [[[170, 198], [130, 198]]] },
      { poles: [stake], ropes: [{ ...A, path: [...back, ...leg, ...two, ...drop, [276, 214]] }] },
      { poles: [stake], ropes: [{ ...A, path: [...back, ...leg, ...two, ...drop, [240, 198], [196, 196], ...hitch(148, 110, 84), [118, 226], [96, 234]] }] },
      { poles: [stake], ropes: [{ ...A, path: [...back, ...leg, ...two, ...drop, [240, 198], [196, 196], ...hitch(148, 110, 84), [118, 226], [96, 234]] }], arrows: [[[150, 50], [250, 50]]] },
    ];
  })(),
  camionero: (() => {
    /**
     * Referencias: fotos camionero-1/2.webp de la app (gaza fija en el medio de la cuerda; el chicote pasa por la gaza y se remata con
     * dos cotes) y la gaza mariposa de `mariposa` (specs/4-gazas.mjs, pero con las orejas mas juntas para que las dos pasadas se crucen a mas de 45 grados).
     * El chicote cruza las dos ramas de la gaza: por ARRIBA de una y por DEBAJO de la otra.
     */
    const ring = { kind: 'ring', x: 80, y: 190, r: 22 };
    const post2 = { x: 390, y: 40, w: 36, h: 230, rx: 8 };
    const Fy = 190; // la cuerda principal va por y = 190
    const up = (pts) => move(pts, 0, -41);
    // Gaza mariposa (copia de `fly` en 4-gazas.mjs) a escala 0,6 con el nudo en x = 270.
    const gaza = up([[216, 231], [270, 225], [298, 196], [270, 189], [240, 165], [237, 138], [255, 114], [287, 114], [305, 141], [300, 165], [270, 189], [242, 196], [270, 225], [324, 231]]);
    const gazaUnder = [[310, 224]];
    // Cote (medio cote) sobre la cuerda principal: `hitch` con el chicote llegando por arriba de la cuerda y avanzando hacia la izquierda.
    const flipY = (pts, cx) => pts.map(([x, y, z]) => (z === undefined ? [cx + x, Fy - y] : [cx + x, Fy - y, z]));
    const cote = (cx) => flipY(hitch(0, 0, 48, 24), cx);
    const coteLink = (cx) => flipY(link(0, 0, 48, 50), cx);
    // Punta atada a la argolla: la cuerda pasa por la argolla (por delante a la derecha y por detras a la izquierda), vuelve por
    // abajo del firme y un cote la sujeta al propio firme. (Se arma desde el firme hacia la punta y se invierte: la punta es el principio.)
    const rot = (pts, cx) => pts.map(([x, y, z]) => (z === undefined ? [cx - x, Fy - y] : [cx - x, Fy - y, z]));
    const attachH = rot(hitch(0, 0, 38, 24), 88);
    const attach = rev([[110, Fy], [62, Fy, 1], [45, Fy + 1, 1], [20, Fy - 3, -1], [6, Fy - 20, -1], [12, Fy - 36], [30, Fy - 44], [55, Fy - 40], ...attachH, [100, Fy - 74], [104, Fy - 86]]);
    const toGaza = [[150, Fy], [200, Fy]];
    const rightLeg = [[330, Fy], [340, Fy]];
    const wrap = up([[358, 238, -1], [380, 240, -1], [397, 222], [397, 196], [380, 178, 1], [352, 172, 1], [322, 168]]);
    // El chicote entra a la gaza por la derecha: por arriba de la rama derecha y por debajo de la izquierda.
    const thread = up([[300, 168, 0.5], [287, 168, 0.5], [262, 170], [241, 168, -0.5], [228, 178, -0.5], [212, 150]]);
    const tail = [[130 - 4, Fy - 66], [110, Fy - 74]];
    const base = { width: 460, poles: [ring, post2] };
    const R = (pts) => move(pts, 40, 0); // todo el dibujo corrido 40 hacia la derecha (margen para la vuelta de la argolla)
    const fig1 = [...attach, ...toGaza, [300, Fy], [420, Fy]];
    const fig2 = [...attach, ...toGaza, ...gaza, ...rightLeg];
    const fig3 = [...fig2, ...wrap, ...thread];
    const fig4 = [...fig3, ...cote(210).slice(1), ...coteLink(210), ...cote(160), [138, Fy - 82], [122, Fy - 92]];
    return [
      { ...base, ropes: [{ ...A, path: R(fig1) }] },
      { ...base, ropes: [{ ...A, path: R(fig2) }], under: gazaUnder },
      { ...base, ropes: [{ ...A, path: R(fig3) }], under: gazaUnder },
      { ...base, ropes: [{ ...A, path: R(fig4) }], under: gazaUnder },
    ];
  })(),
};

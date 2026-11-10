import { A, E8, move, offset, overhand, rev, scale } from '../helpers.mjs';

// As de guía (firme arriba), con la profundidad en cada cruce: el firme es lo
// de más abajo; el chicote sube por debajo de la gaza chica y baja por encima.
const base = { width: 400, height: 420, rope: 14 };
const baseD = { width: 440, height: 540 };
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
      // Seguro (FM 3-97.61, último cuadro): el chicote sale del nudo y se ata un nudo simple chico alrededor de la pata de la
      // gaza que queda al lado: da una vuelta a la pata (por delante y por detrás) y vuelve a cruzarse bajo sí mismo.
      const hitch = [[230, 235, -0.5], [244, 256], [278, 264], [309, 270, 0.5], [338, 278], [344, 300], [326, 318], [309, 312, -0.5], [286, 298], [272, 284], [268, 262, -0.5], [282, 236]];
      return { ...base, height: 440, ropes: [{ ...A, path: [...bowline.slice(0, -1), ...hitch] }] };
    })(),
  ],
  'as-de-guia-doble': (() => {
    // As de guía sobre seno (ABOK 1080): el as de guía común atado con la cuerda doble (el seno hace de chicote). El seno sale por
    // la gaza chica, se abre y se pasa por encima de las gazas hasta el firme, que abraza por detrás (una pata a cada lado y la
    // curva del seno detrás). Fuentes: Wikimedia Commons "Bowline on a bight-noeud de chaise double sur son double.svg"
    // (SuperManu, CC BY-SA 3.0) y la foto as-de-guia-doble-1.webp de la app; el recorrido del as de guía es el del `bowline`.
    // Se dibuja más grande (x1,3) y con el giro de la gaza chica suavizado: así la cuerda doble (un par paralelo) no se pisa a sí misma.
    const S = (pts) => pts.map(([x, y, z]) => [220 + (x - 200) * 1.3, y * 1.3, ...(z === undefined ? [] : [z])]);
    const rope = 11, d = 19;
    const smallD = [[200, -20], [200, 60, 0.5], [204, 104, -0.5], [226, 138], [250, 160], [255, 205, 0.5], [205, 238, 0.5], [160, 238, 0.5], [130, 210], [128, 150], [165, 116, -0.5], [215, 110, 0.5], [262, 118], [290, 145]];
    const bigD = [[318, 220], [318, 320], [250, 395], [160, 388], [112, 330], [120, 292], [146, 266], [166, 250], [169, 238, -0.5], [168, 205], [164, 150], [158, 100, 0.5], [162, 70]];
    const p = S([...smallD, ...bigD]);
    const back = rev(offset(p, d));
    const mk = (seno) => [...p, ...seno, ...back];
    const closed = mk([]);
    // Seno abierto (paso 3): las dos patas se separan y forman una boca ancha arriba, a la izquierda del firme.
    const open = mk(S([[166, 50], [182, 30], [168, 10], [138, 8], [118, 24]]));
    // Seno final (paso 4): una pata pasa por delante del firme (cuerdas del firme z = 0), sube por la derecha y la curva del seno
    // lo rodea por detrás; la otra pata baja por la izquierda.
    const around = mk(S([[160, 50], [182, 38, 1], [212, 36, 1], [252, 42], [262, 24], [240, 12], [205, 12, -0.5], [168, 12], [136, 16], [124, 34], [128, 56]]));
    return [
      { ...baseD, rope, ropes: [{ ...A, path: [[192, -20], [192, 150], [192, 300], ...rev(offset([[192, -20], [192, 150], [192, 300]], d))], end: false }], arrows: [[[240, 320], [240, 380]]] },
      { ...baseD, rope, ropes: [{ ...A, path: closed, end: false }] },
      { ...baseD, rope, ropes: [{ ...A, path: open, end: false }], arrows: [[[100, 40], [52, 150], [52, 330], [130, 408]], [[240, 410], [345, 320], [352, 150], [275, 50]]] },
      { ...baseD, rope, ropes: [{ ...A, path: around, end: false }] },
    ];
  })(),
  corredizo: [
    { ropes: [{ ...A, path: [...nooseLoop, [150, 112], [90, 112]] }], arrows: [[[70, 95], [40, 80]]] },
    { ropes: [{ ...A, path: [...nooseLoop, ...nooseKnot(0.55).path, [80, 185]] }], under: [[147, 150], ...nooseKnot(0.55).under] },
    { ropes: [{ ...A, path: [...nooseLoop.slice(0, -1), [230, 120], ...nooseKnot(0.42).path.slice(1), [100, 175]] }], under: [[147, 150], ...nooseKnot(0.42).under], arrows: [[[150, 205], [215, 205]]] },
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [250, 150], [280, 185], [320, 185], [330, 140], [305, 105], [270, 112], [230, 120], ...nooseKnot(0.42).path.slice(1), [100, 175]] }], under: [[147, 150], ...nooseKnot(0.42).under], arrows: [[[60, 125], [10, 125]]] },
  ],
  'ocho-gaza': (() => {
    // Ocho sobre seno (ABOK 1085 sin la segunda gaza): el ocho de siempre (4 cruces alternados, "FigureOfEightLoop.jpg",
    // CC BY-SA 3.0) hecho con la cuerda doble; el par se dibuja con 18 px entre cuerdas para que cada cruce de pares se lea.
    const rope = 10, d = 20, g = { width: 480, rope };
    const e8h = e8.slice(0, 19); // hasta justo antes del último cruce: el seno todavía no terminó de pasar
    const eyeD = [[385, 148], [418, 164], [452, 160], [476, 133], [452, 104], [418, 100], [385, 114]];
    const full = [...e8, ...eyeD, ...rev(offset(e8, d))];
    return [
      { ...g, ropes: [{ ...A, path: [[-20, 190], [200, 190], [380, 190], ...rev(offset([[-20, 190], [200, 190], [380, 190]], d))], end: false }] },
      { ...g, ropes: [{ ...A, path: [...e8h, ...rev(offset(e8h, d))], end: false }], arrows: [[[268, 131], [330, 128], [400, 140]]] },
      { ...g, ropes: [{ ...A, path: full, end: false }], arrows: [[[40, 235], [5, 235]], [[470, 175], [478, 215]]] },
    ];
  })(),

  'ocho-doble': (() => {
    // Ocho doble (ocho "repasado"): ocho simple, el chicote pasa por el anillo y vuelve a recorrer el ocho en sentido contrario, paralelo
    // a la primera cuerda (mismas profundidades en cada cruce, par a 18 px). El ocho es el mismo que el de ocho-gaza
    // ("FigureOfEightLoop.jpg", CC BY-SA 3.0).
    const rope = 10, d = 20;
    const bulb = [[385, 148], [418, 164], [452, 160, 0], [476, 133, -1], [452, 104, -1], [418, 100], [385, 114]];
    const ring = { kind: 'ring', x: 474, y: 133, r: 26 };
    const back = rev(offset(e8, d));
    const head = [...e8.slice(0, -1), [350, 142]];
    const g = { width: 520, rope, poles: [ring] };
    return [
      { width: 520, rope, ropes: [{ ...A, path: [...head, [395, 160], [440, 190], [500, 200]] }] },
      { ...g, ropes: [{ ...A, path: [...head, ...bulb.slice(0, 6)] }] },
      { ...g, ropes: [{ ...A, path: [...head, ...bulb, ...back.slice(0, 12)] }] },
      { ...g, ropes: [{ ...A, path: [...head, ...bulb, ...back.slice(0, -1), [70, 172]] }], arrows: [[[40, 140], [5, 140]]] },
    ];
  })(),
  'ocho-direccional': (() => {
    // Ocho directional = ocho sobre seno (la gaza sale del nudo apuntando hacia donde se va a tirar). Se ata con un seno en el medio de la
    // cuerda, sin usar las puntas: con las puntas cerradas el nudo es trivial (Alexander 1, comprobado con el par de ocho-gaza).
    // Fuentes: Wikimedia Commons "Directional figure 8 knot.svg" (LadyofHats, dominio público) y fotos ocho-direccional-1..3.webp (FM 3-97.61):
    // la cuerda entra por la izquierda, atraviesa el nudo con dos pasadas paralelas, la gaza sale a la derecha y el otro tramo del firme
    // sale por arriba, rodeando el nudo, hacia la derecha.
    const rope = 10, d = 20;
    const eyeD = [[385, 148], [418, 164], [452, 160], [476, 133], [452, 104], [418, 100], [385, 114]];
    const exit = [[120, 160], [98, 112], [118, 52], [200, 22], [330, 14], [450, 22], [540, 40]];
    const e8h = e8.slice(0, 19);
    const g = { width: 560, height: 300, rope };
    const loopOne = [[-20, 262], [120, 258], [300, 248], [400, 238], [432, 200], [440, 120], [400, 50], [300, 22], [170, 30], [95, 80], [82, 150], [130, 205], [250, 218], [380, 214], [440, 205], [490, 196], [580, 190]];
    return [
      { ...g, ropes: [{ ...A, path: loopOne, end: false }] },
      { ...g, ropes: [{ ...A, path: [...e8h, ...rev(offset(e8h, d)).slice(0, -2), ...exit], end: false }], arrows: [[[268, 131], [330, 128], [400, 140]]] },
      { ...g, ropes: [{ ...A, path: [...e8, ...eyeD, ...rev(offset(e8, d)).slice(0, -2), ...exit], end: false }], arrows: [[[480, 150], [520, 160], [545, 190]]] },
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
    // Los dedos (a la derecha de la mano): la vuelta "del lado de los dedos" es la tercera, la más cercana a ellos.
    const fingers = [0, 1, 2, 3].map((k) => ({ x: 330, y: 108 + k * 22, w: 62, h: 16, rx: 8, fill: '#e8c3a0', stroke: '#a77b58' }));
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
    // Mariposa terminada: la forma (dos orejas arriba, dos lóbulos a los lados y la gaza colgando, con el firme cruzando) está transcripta
    // del cuadro 4 de "Alpine butterfly steps.png" (Ryan Flegel, CC BY-SA 3.0) y de la foto mariposa-2.webp; el recorrido es una sola
    // cuerda de punta a punta y, cerrando las puntas, da el nudo trivial (nudo atado sobre seno, sin usar las puntas, comprobado con
    // Alexander). Ese dibujo no deja ver a ojo cuál cuerda va arriba en cada cruce de la referencia (es muy chica): el orden de los
    // cruces se eligió con esa condición (trivial al cerrar, tramos colgantes por debajo de los lóbulos) y falta confirmarlo contra una
    // foto grande.
    const fly = [[-20,122],[60,122],[130,121],[172,119],[200,117],[228,138],[270,165],[312,200],[322,245],[295,278],[256,284],[230,262],[212,232],[190,198],[163,160],[148,125],[146,88],[158,52],[180,34],[198,44],[192,80],[190,120],[187,190],[174,280],[172,350],[190,392],[215,396],[232,370],[236,300],[230,230],[218,170],[212,120],[212,80],[218,44],[242,32],[260,55],[258,95],[248,135],[230,180],[208,222],[185,255],[155,282],[115,284],[84,250],[88,195],[118,160],[165,138],[205,121],[250,111],[320,116],[420,120]];
    return [
      { poles: [hand, ...fingers], ropes: [{ ...A, path: wraps }] },
      // Paso 2: la tercera vuelta (la del lado de los dedos) sube por encima de las otras dos, rodea la mano por la izquierda y vuelve por debajo de todas.
      { poles: [hand, ...fingers], ropes: [{ ...A, path: wraps }], arrows: [[[318, 70], [250, 38], [170, 38], [118, 100], [125, 205], [190, 252], [262, 240]]] },
      { width: 400, height: 430, ropes: [{ ...A, path: fly }], under: [[190,116],[207,120],[212,125],[243,148],[234,267],[207,224],[187,193],[154,143],[255,111]], arrows: [[[40, 100], [5, 100]], [[360, 100], [395, 100]]] },
    ];
  })(),
  'as-de-guia-corredizo': (() => {
    // As de guía corredizo: un as de guía cuya gaza chica rodea al propio firme (que pasa por dentro de ella: por encima de un lado y
    // por debajo del otro). Fuentes: Wikimedia Commons "Running bowline.svg" (Whidou, CC BY-SA 4.0) y la foto as-de-guia-corredizo-1.webp.
    // El as de guía es el `bowline` de arriba a escala 0,7 (el nudo se lee: cada cruce queda a más de 1,6 grosores del vecino).
    const rope = 11;
    const T = (pts) => pts.map(([x, y, z]) => [250 + (x - 200) * 0.7, 140 + (y - 22) * 0.7 + 22 - 22, ...(z === undefined ? [] : [z])]);
    // Mismo recorrido que `bowline`, con la pata de la gaza chica más inclinada y el chicote bajando más a la derecha: así el chicote
    // cruza las dos cuerdas que se juntan en la esquina de la gaza chica bien separadas (a escala 0,7 no se pisan).
    const smallC = [[200, -20], [200, 60, 0.5], [204, 108, -0.5], [250, 160, -0.5], [258, 205, 0.5], [200, 240, 0.5], [138, 212], [130, 150], [165, 116, -0.5], [215, 106, 0.5], [262, 108], [292, 138]];
    const downC = [[250, 112, 1], [242, 175], [232, 235, -0.5], [238, 290]];
    const bw = T([...smallC, ...big, ...[[175, 32], [200, 22, -0.5], [226, 32], [244, 66]], ...downC]);
    const h = { width: 440, height: 450, rope };
    // Gaza del as de guía: la gaza chica del corredizo es la del fondo (la que sostiene al firme).
    const loopL = 206, loopR = 322, yy = 358;
    const route = [[-20, yy], [120, yy], [loopL, yy, 0.5], [262, yy + 2], [loopR, yy, -0.5], [372, yy - 14], [410, 290], [416, 190], [395, 100], [350, 50], [296, 50], [264, 84]];
    return [
      { ...h, ropes: [{ ...A, path: [[250, -20], ...bw.slice(0)] }] },
      // Paso 2: un seno del firme entra por la gaza chica (por encima de un lado y por debajo del otro) y la flecha muestra que se tira.
      { ...h, ropes: [{ ...A, path: [[430, -20], [432, 200], [430, 392], [398, 404], [loopR - 6, 396, 0.5], [270, 390], [232, 372], [268, 352], [loopR, 350, -0.5], [372, 346], [395, 270], [392, 150], [360, 70], [310, 52], [270, 66], ...bw.slice(0)] }], arrows: [[[232, 432], [190, 432], [150, 415]]] },
      { ...h, ropes: [{ ...A, path: [...route, ...bw.slice(0)] }], arrows: [[[70, 320], [15, 320]]] },
      null,
    ];
  })(),
};

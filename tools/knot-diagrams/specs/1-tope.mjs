import { A, coilH, move, offset, rev, scale } from '../helpers.mjs';

const loop = [[-20, 210], [100, 210], [200, 210], [270, 175], [285, 110], [235, 60], [170, 72], [148, 130], [172, 210]];
const thru = [[185, 250], [212, 270], [238, 248], [228, 205], [215, 150], [232, 112], [290, 95]];
const U = [[228, 205]]; // el chicote pasa por debajo del firme

// Ocho: gaza, vuelta por detrás del firme y entra a la gaza desde adelante.
const eight = [[-20, 220], [120, 220], [230, 218], [290, 180], [295, 110], [245, 65], [185, 80], [170, 140], [195, 225], [215, 265], [180, 290], [140, 270], [150, 220], [190, 170], [245, 140], [300, 135], [350, 142]];


// Escape: puntos tomados del diagrama de referencia (coordenadas de la imagen) y llevados al lienzo (x0,24 + 40; y0,24 + 60).
const escT = (pts) => pts.map(([x, y]) => [Math.round(x * 0.24 + 40), Math.round(y * 0.24 + 60)]);
// Firme (a la izquierda), óvalo de la derecha, arco de abajo, gaza grande y arco de arriba.
const escapeBody = [[-80, 580], [60, 570], [300, 552], [450, 520], [590, 470], [700, 420], [800, 375], [900, 325], [1000, 270], [1100, 235], [1180, 228], [1240, 270], [1275, 350], [1262, 430], [1225, 500], [1160, 545], [1100, 580], [1040, 612], [900, 660], [760, 650], [650, 590], [600, 500], [598, 400], [640, 310], [710, 250], [780, 240], [840, 275]];
// El seno: la pata que baja en diagonal, la vuelta abajo a la derecha y la pata que vuelve hasta la punta (arriba).
const escapeBight = [[900, 335], [960, 400], [1030, 490], [1100, 580], [1180, 660], [1260, 725], [1335, 740], [1375, 700], [1350, 625], [1290, 540], [1220, 460], [1140, 385], [1060, 315], [980, 245], [900, 170], [840, 100], [800, 66]];
const escapeFull = escT([...escapeBody, ...escapeBight]);
// Dónde el firme pasa POR ENCIMA de las patas del seno (el resto lo decide el orden: lo que se hizo después va arriba).
const escapeUnder = escT([[880, 335], [1010, 262]]);
// Paso 1: la punta se dobla en seno, todavía sin pasar por la vuelta.
const escapeStart = escT([...escapeBody, [900, 225], [980, 185], [1020, 150], [995, 118], [940, 135]]);

export default {
  simple: [
    { ropes: [{ ...A, path: [...loop, [190, 260], [205, 290]] }], arrows: [[[222, 283], [262, 262], [258, 228], [236, 165]]] },
    { ropes: [{ ...A, path: [...loop, ...thru, [345, 105]] }], under: U },
    { ropes: [{ ...A, path: [[-20, 170], [60, 170], ...scale(loop.slice(2).concat(thru), 0.75).map(([x, y]) => [x + 45, y + 25]), [320, 104], [420, 108]] }], under: [[216, 179]],
      arrows: [[[45, 215], [5, 215]], [[350, 155], [390, 155]]] },
  ],
  // Escape (simple corredizo, ABOK #529): recorrido transcrito del diagrama "slip knot" de Wikimedia Commons
  // (Overhand-slip-noose.png, CC BY-SA 4.0, Buz11) y de la foto ABOK 529 (USCG, CC BY-SA 4.0), cruce por cruce:
  // el firme pasa por debajo de la gaza y por encima del seno y de la punta; el óvalo pasa por debajo de las dos patas del seno.
  escape: [
    // 1) El nudo simple empezado (firme, óvalo y gaza); la punta se dobla en seno sin cruzar todavía.
    { ropes: [{ ...A, path: escapeStart }], arrows: [[[262, 112], [240, 132], [222, 150]]] },
    // 2) El seno pasa por dentro de la vuelta (las dos patas cruzan el firme y el óvalo): ajustar tirando del firme y del seno.
    { ropes: [{ ...A, path: escapeFull }], under: escapeUnder, arrows: [[[75, 225], [30, 225]], [[330, 262], [368, 255]]] },
    // 3) Para soltarlo, se tira de la punta: el seno sale por donde entró.
    { ropes: [{ ...A, path: escapeFull }], under: escapeUnder, arrows: [[[222, 62], [198, 38], [175, 30]]] },
  ],
  'ocho-simple': [
    { ropes: [{ ...A, path: [...eight.slice(0, 9), [215, 265], [230, 292]] }], arrows: [[[245, 288], [180, 296], [135, 260]]] },
    { ropes: [{ ...A, path: [...eight.slice(0, 13), [168, 196]] }], under: [[150, 220]], arrows: [[[190, 185], [225, 162], [262, 148]]] },
    { ropes: [{ ...A, path: eight }], under: [[150, 220], [298, 135]] },
  ],
  tope: [
    // Vueltas bien abiertas (paso largo) para que cada cruce con el firme se lea solo.
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [300, 150], [340, 160], [352, 196], [326, 226], ...coilH({ x: 290, y: 150, n: 2, pitch: 110, r: 56, from: 'bottom', left: true }), [60, 214], [38, 222]] }],
      arrows: [[[150, 252], [95, 252]]] },
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [300, 150], [340, 160], [352, 196], [326, 226], ...coilH({ x: 290, y: 150, n: 2, pitch: 110, r: 56, from: 'bottom', left: true }), [58, 208, 0], [46, 192, 0], [70, 183, 0], [150, 183, 0], [250, 183, 0], [305, 178, 0], [326, 130], [338, 90]] }] },
    // Ajustado: dos vueltas parejas lado a lado; el chicote sale por debajo de ellas y cruza el firme en ángulo.
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [236, 150], [272, 152], [298, 172], [290, 200], [262, 196], ...coilH({ x: 252, y: 150, n: 2, pitch: 40, r: 28, from: 'bottom', left: true }), [158, 196, 0], [168, 180, 0], [200, 174, 0], [246, 172, 0], [274, 138], [298, 112], [320, 98]] }], zoom: [1.3, 200, 150],
      arrows: [[[110, 195], [60, 195]], [[312, 128], [345, 100]]] },
  ],
};

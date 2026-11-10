import { A, B, coilH, flipX, move, overhand } from '../helpers.mjs';

/**
 * Cruces de dos cuerdas que se retuercen (las dos puntas "se rodean"): cada cruce intercambia los lados y
 * `aOver[i]` dice si en el cruce i va arriba la naranja (a) o la azul (b). Un giro completo son dos cruces
 * que alternan (arriba, abajo) a lo largo de cada cuerda. Las cuerdas salen de abajo del lienzo y las puntas
 * terminan arriba. `gap`: distancia vertical entre cruces; `amp`: cuánto se abren a cada lado.
 */
function twist({ H, gap, amp, aOver, tip = 0, lead = 60 }) {
  const n = aOver.length;
  const ys = aOver.map((_, i) => H - 90 - gap * i);
  const mk = (s, mine) => {
    const p = [[200 + s * 150, H + 15], [200 + s * (amp + 40), ys[0] + lead * 0.8]];
    let side = s;
    for (let i = 0; i < n; i++) {
      p.push([200, ys[i], mine(i) ? 0.5 : -0.5]);
      side = -side;
      const ym = i < n - 1 ? (ys[i] + ys[i + 1]) / 2 : ys[i] - gap / 2;
      p.push([200 + side * amp, ym]);
    }
    p.push([200 + side * (amp + 10), ys[n - 1] - gap / 2 - (tip || 70)]);
    return p;
  };
  return { a: mk(-1, (i) => aOver[i]), b: mk(1, (i) => !aOver[i]), ys };
}

/*
 * Rizo terminado (nudo llano), transcripto del cruce a cruce de "Square knot.svg" (CountingPine, dominio
 * público, Wikimedia Commons): dos senos que se enganchan; cada punta sale del mismo lado que su firme.
 * Naranja desde el firme: arriba, abajo, arriba, arriba, abajo, arriba (6 cruces); azul al revés en cada uno.
 * Con las puntas unidas entre sí y los firmes entre sí da el nudo llano (determinante 9).
 */
const dy = 35; // baja la figura para centrarla
const reefRed = [[-20, 152], [119, 152, 0.5], [152, 152], [196, 181, -0.5], [225, 202], [255, 205], [276, 190], [281, 152, 0.5], [281, 110], [281, 75, 0.5], [279, 48], [262, 28], [237, 22], [212, 33, -0.5], [180, 62, -0.5], [152, 75], [119, 75, 0.5], [56, 75]];
const reefBlue = [[420, 152], [281, 152, -0.5], [248, 152], [196, 181, 0.5], [165, 203], [137, 198], [119, 176], [119, 152, -0.5], [119, 110], [119, 75, -0.5], [122, 48], [138, 28], [162, 22], [182, 32, 0.5], [215, 62, 0.5], [248, 75], [281, 75, -0.5], [335, 75]];
const down = (p) => p.map(([x, y, z]) => [x, y + dy, ...(z === undefined ? [] : [z])]);
const reefA = down(reefRed), reefB = down(reefBlue);

/*
 * Escota doble. Referencias: dibujo de la app escota-doble-1.webp (estilo FM 5-125: la fina entra por debajo de la
 * curva del seno, sube por dentro junto a la curva, pasa por encima de la pata de arriba, da las vueltas por detrás
 * de las DOS patas, a la izquierda de la curva, vuelve por delante de las dos patas y termina pasando por debajo de
 * sí misma), "Sheet bend.svg" y "Double sheet bend.svg" (Lucasbosch, CC BY-SA 3.0) y "Doppelter Schotstek.jpg"
 * (Markus Baerlocher, dominio público). Recorrido de la fina desde el firme, escota simple: abajo (curva), arriba
 * (pata de arriba), abajo (arriba), abajo (abajo), arriba (abajo), arriba (arriba), abajo de sí misma; la doble
 * repite la vuelta (abajo, abajo, arriba, arriba) antes de pasar por debajo de sí misma.
 */
const LT = 115, LB = 205; // patas del seno (arriba / abajo)
// Seno de la cuerda gruesa (naranja): el firme sale por la pata de abajo y la cola termina arriba, con punta visible.
const bight = [[-20, LB], [150, LB], [262, LB + 2], [302, 160], [262, LT - 2], [150, LT], [40, LT]];
// La fina entra por debajo de la curva y sube por dentro del seno, junto a la curva; pasa por encima de la pata de arriba.
const sheetIn = [[420, 262], [350, 246], [318, 222], [292, 188, -0.5], [272, 152], [258, LT, 0.5], [256, 82]];
// Vueltas alrededor de las dos patas (xb: baja por detrás, xf: sube por delante) y el chicote que pasa por debajo de sí misma.
const back = (x) => [[x, LT, -0.5], [x, 160], [x, LB, -0.5]];
const front = (x) => [[x, LB, 0.5], [x, 160], [x, LT, 0.5]];
const bottom = (xb, xf) => [[xb + 1, 225], [xb + 6, 242], [(xb + xf) / 2, 252], [xf - 6, 242], [xf - 1, 225]];
const arcTop1 = (xb) => [[248, 58], [215, 45], [165, 45], [xb + 22, 58], [xb + 2, 84]];
const arcTop2 = (xf, xb) => [[xf, 92], [xf + 6, 78], [(xf + xb) / 2, 72], [xb - 6, 78], [xb, 92]];
const tuck = (x) => [[x, 78, -0.5], [x, 22, -0.5]];
const sheetOne = (xb, xf) => [...sheetIn, ...arcTop1(xb), ...back(xb), ...bottom(xb, xf), ...front(xf), ...tuck(xf)];
const sheetTwo = (xb1, xf1, xb2, xf2) => [...sheetIn, ...arcTop1(xb1), ...back(xb1), ...bottom(xb1, xf1), ...front(xf1), ...arcTop2(xf1, xb2), ...back(xb2), ...bottom(xb2, xf2), ...front(xf2), ...tuck(xf2)];


// Pescador: dos puntas paralelas, cada una con un simple alrededor de la otra.
// Referencia: "Fisherman's knot diagram.png" (Hereford Brooke George, dominio público) y las fotos de la app pescador-1..3.webp.
export default {
  rizo: (() => {
    // Primer medio nudo: derecha sobre izquierda (azul arriba) y vuelta por debajo; segundo, al revés (naranja arriba).
    const t1 = twist({ H: 400, gap: 66, amp: 44, aOver: [false, true], tip: 150 });
    const t2 = twist({ H: 400, gap: 66, amp: 44, aOver: [false, true, true, false], tip: 40 });
    return [
      { height: 400, ropes: [{ ...A, path: t1.a }, { ...B, path: t1.b }], arrows: [[[262, 345], [238, 322], [214, 300]]] },
      { height: 400, ropes: [{ ...A, path: t2.a }, { ...B, path: t2.b }], arrows: [[[160, 195], [180, 172], [200, 152]]] },
      { ropes: [{ ...A, path: reefA }, { ...B, path: reefB }], arrows: [[[75, 187], [30, 187]], [[345, 187], [390, 187]], [[100, 110], [66, 110]], [[300, 110], [334, 110]]] },
    ];
  })(),
  cirujano: (() => {
    // Doble media vuelta (cuatro cruces que alternan) y después una media vuelta al revés (dos cruces).
    const o1 = [false, true, false, true], o3 = [...o1, true, false];
    const t1 = twist({ H: 400, gap: 56, amp: 42, aOver: o1, tip: 40 });
    const t2 = twist({ H: 400, gap: 46, amp: 34, aOver: o1, tip: 40 });
    const t3 = twist({ H: 400, gap: 46, amp: 34, aOver: o3, tip: 40 });
    const pull = [[[70, 372], [35, 392]], [[330, 372], [365, 392]]];
    return [
      { height: 400, ropes: [{ ...A, path: t1.a }, { ...B, path: t1.b }] },
      { height: 400, ropes: [{ ...A, path: t2.a }, { ...B, path: t2.b }], arrows: pull },
      { height: 400, ropes: [{ ...A, path: t3.a }, { ...B, path: t3.b }], arrows: pull },
    ];
  })(),
  'escota-doble': [
    { ropes: [{ ...A, path: bight }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetIn }], arrows: [[[250, 72], [208, 46], [150, 56], [118, 100], [114, 160]]] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetOne(100, 140) }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetTwo(100, 140, 180, 222) }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetTwo(100, 140, 180, 222) }], arrows: [[[60, LB], [25, LB]], [[370, 258], [398, 266]]] },
  ],
  pescador: (() => {
    const oa = overhand({ x: 250, y: 130, k: 0.55 }); // firme naranja en y = 168
    const ob = overhand({ x: 150, y: 168, k: 0.55, mirror: true, flip: true }); // firme azul en y = 130
    const blueLine = [[420, 130], [300, 130], [120, 130], [60, 130]];
    return [
      { ropes: [{ ...A, path: [[-20, 168], [120, 168], [300, 168], [340, 168]] }, { ...B, path: [[420, 130], [280, 130], [100, 130], [60, 130]] }] },
      // La flecha va sobre el simple de la naranja (arriba del nudo, hacia donde pasa la punta).
      { ropes: [{ ...A, path: [[-20, 168], [80, 168], ...oa.path, [330, 90]] }, { ...B, path: blueLine }], under: [[253, 130], ...oa.under], arrows: [[[215, 62], [262, 46], [312, 66]]] },
      // Las flechas van sobre los firmes: naranja (y = 168) a la izquierda, azul (y = 130) a la derecha.
      { ropes: [{ ...A, path: [[-20, 168], [80, 168], ...oa.path, [330, 90]] }, { ...B, path: [[420, 130], [320, 130], ...ob.path, [70, 208]] }], under: [[253, 130], [147, 168], ...oa.under, ...ob.under],
        arrows: [[[75, 168], [30, 168]], [[345, 130], [392, 130]]] },
    ];
  })(),
  'pescador-doble': (() => {
    /*
     * Cada mitad es un double overhand alrededor de la otra cuerda (control de knots.ts: "dos X de un lado y cuatro trazos
     * paralelos del otro"). Referencias: fotos de la app pescador-doble-2/3.webp, "Double fisherman's knot cordelette.png"
     * (ScrubbedFalcon, CC BY-SA 4.0) y "Noeud de pecheur double serre.jpg" (Malta, CC BY-SA 2.5).
     * Recorrido de la naranja: el firme (y = 188) sigue recto, da una U, da DOS vueltas hacia la izquierda alrededor de tres
     * cuerdas (la azul arriba, su propia punta en el medio y su propio firme abajo; por delante al subir, por detrás al
     * bajar) y la punta vuelve por dentro de las dos vueltas, por encima del firme, hasta salir a la derecha.
     */
    const W = 600, C = 149, R = 48, P = 90, TILT = 0.2, XR = 520, YS = 174, XL = XR - 2 * P;
    const half = () => {
      const path = [[-20, YS], [250, YS], [XR - 20, YS], [XR + 18, YS + 2], [XR + 32, YS + 12], [XR + 22, C + R + 1]];
      for (let i = 0; i <= 16; i++) {
        const th = (i / 8) * Math.PI * 2, sn = Math.sin(th);
        path.push([XR - P * (th / (2 * Math.PI)) - TILT * R * sn, C + R * Math.cos(th), Math.abs(sn) < 1e-9 ? 0 : sn > 0 ? 1 : -1]);
      }
      path.push([XL - 14, C + R - 14], [XL - 16, YS, 0.3], [XL - 8, C + 8, 0.3], [XL + 4, C, 0.3], [XR, C, 0.3], [XR + 52, C, 0.3]);
      return path;
    };
    const a = half();
    const mirror = (p) => p.map(([x, y, zz]) => [W - x, 298 - y, ...(zz === undefined ? [] : [zz])]);
    const yb = 298 - YS;
    return [
      { width: W, ropes: [{ ...A, path: [[-20, YS], [250, YS], [450, YS], [490, YS]] }, { ...B, path: [[W + 20, yb], [350, yb], [150, yb], [110, yb]] }] },
      { width: W, ropes: [{ ...A, path: a }, { ...B, path: [[W + 20, yb], [450, yb], [250, yb], [110, yb]] }], arrows: [[[440, 68], [500, 54], [560, 84]]] },
      { width: W, ropes: [{ ...A, path: a }, { ...B, path: mirror(a) }], arrows: [[[70, YS], [30, YS]], [[530, yb], [570, yb]]] },
    ];
  })(),
};

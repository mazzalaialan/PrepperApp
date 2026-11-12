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
    // As de guía sobre seno (ABOK 1080), TRANSCRIPTO del trazado vectorial "Bowline on a bight-noeud de chaise double sur son double.svg"
    // (SuperManu / Emmanuel Boutet, CC BY-SA 3.0, Wikimedia Commons): una sola cuerda, recorrida de punta a punta desde el firme (arriba a
    // la izquierda) por la gaza chica, las dos gazas grandes, el seno que abraza al firme y la vuelta en paralelo hasta el chicote.
    // Puntos = cuentas de la cuerda en coordenadas del SVG (11..1051 x 15..476), escalados x0,95. 18 cruces; en los 8 donde el tramo que
    // se recorre primero va por ARRIBA se marca `under` (el resto: lo que se hizo después va arriba). Secuencia del paso 4 (refs/):
    // ABBBBAABAABBBBAAAABBAABBAABABAAABBBA. Los pasos 1 a 3 son la misma cuerda dibujada hasta cierto punto.
    const RAW = [[11,15],[19,29],[32,40],[49,51],[66,62],[82,73],[99,85],[115,96],[132,107],[149,118],[166,129],[182,140],[200,150],[217,160],[235,169],[253,178],[271,186],[290,193],[309,199],[328,204],[348,209],[368,212],[388,215],[408,218],[428,219],[448,221],[468,222],[488,222],[508,222],[528,222],[548,222],[568,221],[586,218],[609,213],[623,205],[627,187],[622,161],[612,144],[600,128],[585,114],[570,101],[554,89],[538,78],[521,68],[503,60],[485,54],[467,53],[442,57],[428,68],[420,87],[416,108],[415,128],[414,148],[415,168],[417,188],[420,208],[423,228],[430,248],[439,266],[448,283],[459,300],[471,317],[483,333],[496,348],[510,362],[524,376],[539,389],[555,402],[571,414],[588,424],[606,434],[624,443],[642,451],[661,458],[680,464],[699,469],[719,472],[739,475],[759,476],[779,475],[799,474],[819,471],[838,467],[859,461],[878,454],[896,446],[913,436],[927,421],[940,406],[951,390],[961,372],[969,354],[975,335],[980,316],[983,296],[984,276],[983,256],[981,236],[976,215],[968,196],[959,179],[947,163],[932,150],[916,139],[897,130],[878,125],[858,121],[838,118],[818,116],[798,115],[778,114],[758,114],[738,115],[718,117],[698,120],[678,124],[658,129],[639,136],[620,143],[602,152],[585,161],[568,172],[551,183],[535,194],[519,206],[505,221],[493,238],[481,254],[470,271],[458,288],[444,305],[426,316],[398,318],[386,308],[373,295],[363,278],[354,260],[348,239],[345,218],[344,197],[349,177],[362,166],[385,161],[403,159],[423,159],[442,160],[462,160],[481,160],[500,157],[521,149],[537,138],[555,128],[572,118],[590,109],[608,99],[626,91],[644,83],[663,75],[681,68],[701,62],[720,56],[740,51],[760,47],[779,44],[799,41],[819,40],[840,40],[860,40],[880,43],[900,46],[919,51],[938,58],[956,66],[974,75],[990,87],[1005,100],[1019,114],[1030,131],[1040,148],[1046,169],[1050,189],[1051,209],[1048,229],[1043,248],[1034,266],[1023,282],[1010,297],[995,310],[979,322],[961,331],[943,340],[924,347],[905,353],[885,358],[865,362],[845,364],[825,366],[805,367],[785,368],[765,368],[745,367],[725,366],[705,364],[685,361],[666,359],[645,355],[625,351],[607,343],[589,334],[573,323],[556,311],[541,299],[526,285],[512,271],[500,255],[488,239],[477,222],[469,204],[462,183],[459,163],[459,142],[465,121],[482,112],[503,115],[517,124],[532,137],[545,152],[557,168],[567,185],[576,203],[582,225],[583,248],[575,263],[559,271],[536,276],[517,278],[498,279],[478,278],[458,277],[437,277],[417,275],[398,272],[378,268],[359,263],[340,258],[320,254],[301,250],[281,247],[262,245],[242,245],[222,247],[202,250],[182,255]];
    const UN = [[345,208],[613,146],[583,112],[445,277],[490,242],[466,277],[459,160],[519,278]];
    const T = ([x, y]) => [Math.round(x * 0.95 + 25), Math.round(y * 0.95 + 25)];
    const g = { width: 1040, height: 490, rope: 12 };
        const cut = (n) => RAW.slice(0, n).map(T);
    const under = UN.map(T);
    return [
      { ...g, ropes: [{ ...A, path: cut(30), end: false }], arrows: [[[480, 190], [560, 240]]] },
      { ...g, ropes: [{ ...A, path: cut(128), end: false }], under },
      { ...g, ropes: [{ ...A, path: cut(215), end: false }], under },
      { ...g, ropes: [{ ...A, path: cut(RAW.length), end: false }], under },
    ];
  })(),
  corredizo: [
    { ropes: [{ ...A, path: [...nooseLoop, [150, 112], [90, 112]] }], arrows: [[[70, 95], [40, 80]]] },
    { ropes: [{ ...A, path: [...nooseLoop, ...nooseKnot(0.55).path, [80, 185]] }], under: [[147, 150], [120, 150], ...nooseKnot(0.55).under] },
    { ropes: [{ ...A, path: [...nooseLoop.slice(0, -1), [230, 120], ...nooseKnot(0.42).path.slice(1), [100, 175]] }], under: [[147, 150], [120, 150], ...nooseKnot(0.42).under], arrows: [[[150, 205], [215, 205]]] },
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [250, 150], [280, 185], [320, 185], [330, 140], [305, 105], [270, 112], [230, 120], ...nooseKnot(0.42).path.slice(1), [100, 175]] }], under: [[147, 150], [120, 150], ...nooseKnot(0.42).under], arrows: [[[60, 125], [10, 125]]] },
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
  // Ocho de dos gazas: SIN diagrama paso a paso hasta tener uno verificado contra una referencia real (ver refs/ocho-dos-gazas.json):
  // el dibujo anterior era un ocho con una sola gaza retorcida y no el nudo (le faltaba el seno sobrante que abraza el cuello).
  // Mientras tanto la ficha muestra la foto del manual y el texto.
  'ocho-dos-gazas': [],
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
    // Transcripto cruce por cruce del cuadro 3 de "Alpine butterfly knot diagram.png" (LadyofHats, dominio publico): coordenadas de la imagen
    // (cuadro recortado) x3. Una cuerda de punta a punta (arriba a la derecha hasta abajo a la derecha), 12 cruces: BABAABBABBAAAABBABBBAAAB.
    const flyRaw = [[225,22],[200,24],[178,36],[158,50],[140,62],[125,76],[108,86],[92,90],[72,88],[55,78],[44,60],[46,40],[60,22],[82,10],[110,8],[140,13],[165,24],[177,36],[172,48],[155,56],[138,61],[120,60],[95,56],[65,52],[40,42],[20,42],[8,55],[14,70],[35,78],[65,73],[100,66],[130,64],[158,68],[175,80],[181,95],[172,108],[150,118],[125,122],[100,118],[78,106],[64,88],[58,65],[60,40],[72,22],[92,15],[110,20],[125,38],[138,60],[148,72],[162,86],[185,98],[205,102],[225,106]];
    // Mismos puntos con z (+1 la pasada que va por arriba, -1 la de abajo) en cada cruce: los cruces del centro estan a menos de 14 px
    // y `under` no los distingue.
    const flyT = [[675,76],[641.6,76.8],[600,82],[566.1,97.8],[534,118,-1],[503.2,138.8],[474,160,1],[446.1,179.3],[420,199,-1],[397.3,222.1,1],[375,244],[349.7,261.1],[324,274],[300.6,282.6],[276,286],[246.2,282.6],[216,274],[188.8,261.6,1],[165,244,-1],[144.9,218.9],[132,190],[130.3,160.0],[138,130,-1],[155.2,101.5],[180,76],[210.4,55.0],[246,40],[286.5,33.8],[330,34],[375.6,39.1],[420,49],[460.9,64.2],[495,82],[518.2,100.2],[531,118,1],[531.4,134.5],[522,148],[504.6,155.9],[480,160,-1],[448.1,160.4],[414,160,-1],[384.2,162.6],[354,166],[321.4,169.8],[285,172],[240.4,171.2],[195,166],[155.6,150.6,1],[120,136,1],[87.6,131.7],[60,136],[37.1,152.7],[24,175],[26.8,198.4],[42,220],[69.0,235.6],[105,244],[147.4,240.2,1],[195,232,1],[247.5,225.2],[300,220],[346.3,218.5],[390,220,-1],[434.4,224.1,-1],[474,232],[503.6,245.3],[525,262],[538.9,280.9],[543,301,1],[534.8,321.2],[516,340],[486.0,355.2],[450,367],[413.1,375.6],[375,379],[336.9,374.5],[300,364],[264.9,348.4],[234,328],[210.0,303.1],[192,274,-1],[180.0,240.8,-1],[174,205],[173.6,166.6,-1],[180,130],[194.6,99.6],[216,76],[244.9,61.2],[276,55],[303.9,57.8],[330,70],[353.4,94.6],[375,124],[395.4,151.4,1],[414,178],[428.8,202.8,1],[444,226,1],[462.6,247.8],[486,268],[519.4,287.9],[555,304,-1],[585.6,311.5],[615,316],[648.8,322.8],[675,328]];
    const flyUnder = [];
    return [
      { poles: [hand, ...fingers], ropes: [{ ...A, path: wraps }] },
      // Paso 2: la tercera vuelta (la del lado de los dedos) sube por encima de las otras dos, rodea la mano por la izquierda y vuelve por debajo de todas.
      { poles: [hand, ...fingers], ropes: [{ ...A, path: wraps }], arrows: [[[318, 70], [250, 38], [170, 38], [118, 100], [125, 205], [190, 252], [262, 240]]] },
      { width: 690, height: 400, rope: 14, ropes: [{ ...A, path: flyT }], under: flyUnder, arrows: [[[60, 150], [15, 150]], [[630, 50], [680, 50]]] },
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

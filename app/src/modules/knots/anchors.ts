import type { KnotUse, L } from './knots';

/**
 * Anclajes (ARQUITECTURA §10.2). Datos del FM 3-97.61 "Military Mountaineering"
 * (Ejército de EE. UU., 2002), capítulo 5, y del FM 5-125 "Rigging Techniques,
 * Procedures and Applications" (2001), capítulo 4; ambos de dominio público,
 * igual que las figuras de public/anchors/. Textos propios. Donde un número es
 * una recomendación de la app (y no del manual), se dice.
 */

const l = (es: string, en: string): L => ({ es, en });

export const ANCHOR_KINDS = ['natural', 'attach', 'system', 'improvised', 'basics'] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export interface Anchor {
  id: string;
  kind: AnchorKind;
  name: L;
  aliases: string[];
  uses: KnotUse[];
  summary: L;
  /** Cómo se arma o qué revisar, en orden. */
  steps: L[];
  /** public/anchors/ o public/knots/ ("knots/…"). */
  images: string[];
  check: L;
  mistakes: L[];
  /** Nudos de la guía que se usan. */
  knots: string[];
  /** Tabla de datos (ángulos, resistencia de estacas). */
  table?: { head: [L, L]; rows: [string, string][]; note?: L };
}

export const ANCHORS: Anchor[] = [
  {
    id: 'principios',
    kind: 'basics',
    name: l('Principios de un buen anclaje', 'Principles of a good anchor'),
    aliases: ['principios', 'reglas', 'seguridad', 'SRENE', 'ERNEST', 'bombproof'],
    uses: ['rappel', 'rescue', 'camp', 'survival', 'cargo'],
    summary: l('Lo que tiene que cumplir cualquier anclaje del que dependa una persona.', 'What any anchor a person depends on must meet.'),
    steps: [
      l('Fuerte: más resistente que cualquier carga que pueda recibir ("a prueba de bombas", dice el manual). Ante la duda, no lo es.', 'Strong: stronger than any load it could receive ("bombproof", in the manual’s words). If in doubt, it is not.'),
      l('Redundante: para personas, nunca un solo punto de anclaje ni un solo mosquetón sin seguro. Si falla una pieza, otra sostiene.', 'Redundant: for people, never a single anchor point or a single non-locking carabiner. If one piece fails, another holds.'),
      l('Repartido: la carga se reparte entre los puntos, no la toma uno solo.', 'Equalized: the load is shared among the points, not taken by one.'),
      l('Sin extensión: si falla un punto, el resto no recibe un tirón por el largo que se suelta.', 'No extension: if one point fails, the others do not get shock-loaded by slack.'),
      l('Simple y rápido de revisar: cuantas menos piezas, menos errores.', 'Simple and quick to check: fewer pieces, fewer mistakes.'),
      l('Mosquetones con seguro; si no hay, dos mosquetones con los gatillos opuestos: que al abrirlos formen una "X".', 'Locking carabiners; if none, two carabiners with opposed gates: when opened they form an X.'),
      l('Protegé los bordes filosos con tela, una mochila o un tubo, y nunca hagas correr cuerda sobre una cinta de nylon: el roce la funde.', 'Pad sharp edges with cloth, a pack or a tube, and never run rope over a nylon sling: friction melts it.'),
    ],
    images: ['mosquetones-opuestos.webp'],
    check: l('Repasalo en voz alta con tu compañero: puntos, cintas, nudos, mosquetones cerrados y dirección de la carga.', 'Go over it aloud with your partner: points, slings, knots, locked carabiners and direction of load.'),
    mistakes: [l('Confiar en un solo punto "porque parece firme".', 'Trusting a single point "because it looks solid".')],
    knots: [],
  },
  {
    id: 'angulos',
    kind: 'basics',
    name: l('Ángulos y fuerzas', 'Angles and forces'),
    aliases: ['ángulo', 'angulo', 'fuerza', 'V', 'triángulo', 'triangulo americano'],
    uses: ['rappel', 'rescue', 'cargo'],
    summary: l('Cuanto más abiertos los brazos de un anclaje, más carga recibe cada punto. A más de 90° el anclaje puede fallar.', 'The wider the arms of an anchor, the more load each point takes. Above 90° the anchor can fail.'),
    steps: [
      l('Mantené el ángulo entre los brazos por debajo de 60° si podés; nunca más de 90°.', 'Keep the angle between the arms under 60° if you can; never over 90°.'),
      l('Si los puntos están muy separados, alargá los brazos (más cinta o cordino) para cerrar el ángulo.', 'If the points are far apart, lengthen the arms (more sling or cord) to close the angle.'),
      l('No armes un triángulo con una sola cinta pasando por los dos puntos ("triángulo americano"): multiplica la carga en cada punto.', 'Do not rig a triangle with one sling running through both points ("American triangle"): it multiplies the load on each point.'),
    ],
    images: ['angulos.webp'],
    check: l('Mirá el ángulo en la "V" que forman los brazos donde se juntan.', 'Look at the angle of the V where the arms meet.'),
    mistakes: [l('Tensar una cuerda horizontal entre dos árboles (pasamanos, tirolesa): el ángulo es casi plano y la fuerza en los anclajes es enorme.', 'Tensioning a horizontal line between two trees (handline, zipline): the angle is nearly flat and the anchor forces are huge.')],
    knots: [],
    table: {
      head: [l('Ángulo entre brazos', 'Angle between arms'), l('Carga en cada brazo', 'Load on each arm')],
      rows: [
        ['0°', '50 %'],
        ['60°', '58 %'],
        ['90°', '71 %'],
        ['120°', '100 %'],
        ['150°', '193 %'],
        ['170°', '574 %'],
      ],
      note: l(
        'Respecto de la carga total: cada brazo = carga ÷ (2 × coseno de la mitad del ángulo). Dibujo: FM 3-97.61, figura 5-20 (su tabla da 1150 % para 170°, un error: la cuenta da 574 %).',
        'Relative to the total load: each arm = load ÷ (2 × cosine of half the angle). Drawing: FM 3-97.61, figure 5-20 (its table gives 1150% for 170°, an error: the math gives 574%).',
      ),
    },
  },
  {
    id: 'arbol',
    kind: 'natural',
    name: l('Árbol', 'Tree'),
    aliases: ['árbol', 'arbol', 'tronco', 'tree'],
    uses: ['rappel', 'rescue', 'camp', 'survival', 'cargo'],
    summary: l('El anclaje natural más usado. Hay que revisarlo bien: tamaño, que esté vivo y bien arraigado.', 'The most used natural anchor. Check it carefully: size, alive and well rooted.'),
    steps: [
      l('Tamaño (recomendación de la app; el manual no da un número): para una persona, al menos 20 cm de diámetro, unos 63 cm alrededor del tronco. Para rescate o dos personas, al menos 30 cm de diámetro, unos 94 cm alrededor.', 'Size (app recommendation; the manual gives no number): for one person, at least 20 cm in diameter, about 63 cm around the trunk. For rescue or two people, at least 30 cm in diameter, about 94 cm around.'),
      l('Que esté vivo y sano: sin madera seca, podrida o hueca, sin hongos en la base y sin ramas muertas arriba que puedan caer.', 'Alive and healthy: no dry, rotten or hollow wood, no fungus at the base and no dead branches above that could fall.'),
      l('Probá el arraigo empujando y tirando: en terreno rocoso las raíces son poco profundas.', 'Test the rooting by pushing and pulling: in rocky ground roots are shallow.'),
      l('Atá lo más abajo posible, para que el árbol no haga palanca.', 'Tie as low as possible so the tree does not act as a lever.'),
      l('En árboles con resina, poné una tela entre el tronco y la cinta o la cuerda.', 'On resinous trees, put cloth between the trunk and the sling or rope.'),
      l('Suelo arenoso o rocoso, o raíces a la vista: usalo solo como un punto más de un anclaje con varios.', 'Sandy or rocky soil, or exposed roots: use it only as one point of a multi-point anchor.'),
    ],
    images: ['arboles.webp', 'arbol-bajo.webp'],
    check: l('No se mueve al empujarlo con fuerza, y la cinta queda al pie del tronco.', 'It does not move when pushed hard, and the sling sits at the base of the trunk.'),
    mistakes: [l('Atar alto en un árbol finito: palanca y riesgo de que se quiebre o se arranque.', 'Tying high on a thin tree: leverage and risk of breaking or uprooting it.')],
    knots: ['ocho-doble', 'as-de-guia', 'alondra', 'nudo-cinta'],
  },
  {
    id: 'bloque',
    kind: 'natural',
    name: l('Bloques y rocas', 'Boulders'),
    aliases: ['roca', 'bloque', 'piedra', 'boulder'],
    uses: ['rappel', 'rescue', 'camp', 'survival'],
    summary: l('Una roca grande y firme, rodeada con una cinta o con la cuerda.', 'A large, solid rock, slung with webbing or the rope.'),
    steps: [
      l('Golpeala o empujala: tiene que sonar y sentirse maciza, sin moverse.', 'Tap or push it: it must sound and feel solid, without moving.'),
      l('Desconfiá de rocas sedimentarias sueltas y de zonas con piedras caídas al pie (pedreros): indican roca floja.', 'Distrust loose sedimentary rock and areas with fallen stones at the base (scree): they signal loose rock.'),
      l('Pasá la cinta bien abajo, donde no se pueda salir por arriba al cargarla.', 'Place the sling low, where it cannot slip off the top when loaded.'),
      l('Acolchá todo borde que pueda cortar la cinta o la cuerda.', 'Pad any edge that could cut the sling or rope.'),
    ],
    images: ['bloques.webp'],
    check: l('Cargala en la dirección en que va a trabajar: no tiene que moverse ni la cinta subir.', 'Load it in the working direction: it must not move nor the sling ride up.'),
    mistakes: [l('Una roca que "parece" pesada pero está apoyada en un punto: puede rodar.', 'A rock that "looks" heavy but rests on one point: it can roll.')],
    knots: ['nudo-cinta', 'ocho-gaza'],
  },
  {
    id: 'empotrador',
    kind: 'natural',
    name: l('Piedra trabada en una grieta', 'Chockstone'),
    aliases: ['empotrador natural', 'piedra trabada', 'chockstone'],
    uses: ['rappel', 'rescue'],
    summary: l('Una piedra encajada en una grieta que se angosta hacia abajo. Sirve en una dirección.', 'A stone wedged in a crack that narrows downward. Works in one direction.'),
    steps: [
      l('Revisá que sea sólida, que no se desarme y que tenga mucho contacto con la roca.', 'Check it is solid, not crumbling and in broad contact with the rock.'),
      l('Suele ser direccional: aguanta hacia abajo pero puede saltar si se tira hacia otro lado.', 'It is usually directional: holds downward but can pop out if pulled another way.'),
      l('Pasá la cinta por detrás de la piedra, sin que quede apretada entre la piedra y la pared: una caída la cortaría.', 'Run the sling behind the stone, not pinched between stone and wall: a fall would cut it.'),
      l('Probala siempre antes de usarla.', 'Always test it before use.'),
    ],
    images: ['empotradores.webp'],
    check: l('Tirando en la dirección de la carga, no se mueve.', 'Pulling in the direction of load, it does not move.'),
    mistakes: [l('Cargarla en una dirección distinta a la que traba.', 'Loading it in a direction other than the one it locks in.')],
    knots: ['nudo-cinta'],
  },
  {
    id: 'saliente',
    kind: 'natural',
    name: l('Salientes, puentes de roca y arcos', 'Rock horns, tunnels and arches'),
    aliases: ['saliente', 'punta de roca', 'puente de roca', 'arco', 'horn', 'flake'],
    uses: ['rappel', 'rescue'],
    summary: l('Puntas, lajas y bloques de la pared, o agujeros que atraviesan la roca. Los puentes y arcos son de los anclajes más seguros: aguantan en cualquier dirección.', 'Horns, flakes and blocks on the wall, or holes through the rock. Tunnels and arches are among the most secure: they hold in any direction.'),
    steps: [
      l('Revisá que la saliente no tenga grietas ni roca meteorizada; si las tiene, descartala.', 'Check the horn has no cracks or weathered rock; if it does, reject it.'),
      l('En una saliente, cinta bien abajo y que no pueda salirse por arriba.', 'On a horn, place the sling low so it cannot slide off the top.'),
      l('En un puente o arco, pasá la cinta por el agujero y cerrala con nudo de cinta o cabeza de alondra.', 'Through a tunnel or arch, thread the sling and close it with a water knot or girth hitch.'),
      l('Acolchá los bordes filosos.', 'Pad sharp edges.'),
    ],
    images: ['salientes.webp'],
    check: l('Golpeala: sin sonido hueco ni movimiento.', 'Tap it: no hollow sound or movement.'),
    mistakes: [l('Lajas delgadas: pueden partirse.', 'Thin flakes: they can break off.')],
    knots: ['nudo-cinta', 'alondra'],
  },
  {
    id: 'arbustos',
    kind: 'natural',
    name: l('Arbustos y matas', 'Bushes and shrubs'),
    aliases: ['arbusto', 'mata', 'raíces', 'bush'],
    uses: ['survival', 'camp', 'rescue'],
    summary: l('Último recurso: las raíces de varios arbustos juntos.', 'Last resort: the roots of several bushes together.'),
    steps: [
      l('Rodeá con la cuerda la base de varios arbustos juntos, no de uno solo.', 'Run the rope around the bases of several bushes together, not just one.'),
      l('Lo más abajo posible, para no hacer palanca.', 'As low as possible, to avoid leverage.'),
      l('Que estén sanos y bien arraigados.', 'They must be healthy and well rooted.'),
    ],
    images: ['arbustos.webp'],
    check: l('Probá con todo tu peso antes de confiar.', 'Test with your full weight before trusting it.'),
    mistakes: [l('Usarlos cuando hay otra opción.', 'Using them when another option exists.')],
    knots: ['vuelta-redonda', 'ballestrinque'],
  },
  {
    id: 'cinta',
    kind: 'attach',
    name: l('Sujetar una cinta al anclaje', 'Slinging an anchor'),
    aliases: ['cinta', 'eslinga', 'anillo', 'sling', 'drape', 'wrap', 'girth'],
    uses: ['rappel', 'rescue', 'camp'],
    summary: l('Tres formas de poner una cinta en un árbol o una roca: apoyada, rodeando o con cabeza de alondra.', 'Three ways to put a sling on a tree or rock: draped, wrapped or girth-hitched.'),
    steps: [
      l('Apoyada: la cinta cerrada se cuelga por encima del anclaje.', 'Drape: the closed sling hangs over the anchor.'),
      l('Rodeando: la cinta da la vuelta al anclaje y las dos puntas se juntan en el mosquetón.', 'Wrap: the sling goes around the anchor and both ends meet in the carabiner.'),
      l('Cabeza de alondra: la cinta se ahorca sobre el anclaje. Debilita la cinta, pero no se corre.', 'Girth: the sling is girth-hitched on the anchor. It weakens the sling but does not slide.'),
      l('El nudo de la cinta, a un costado, donde no moleste al mosquetón. El gatillo del mosquetón, hacia afuera y abriendo hacia el lado contrario al anclaje.', 'The sling’s knot goes to the side, out of the carabiner’s way. The gate faces out and opens away from the anchor.'),
    ],
    images: ['cinta-apoyada.webp', 'cinta-rodeando.webp', 'cinta-alondra.webp'],
    check: l('La cinta no se corre ni puede salirse cuando se carga.', 'The sling does not slide or come off when loaded.'),
    mistakes: [l('Cinta apoyada en una saliente que se puede salir por arriba.', 'A draped sling on a horn it can slip off.')],
    knots: ['alondra', 'nudo-cinta'],
  },
  {
    id: 'cuerda-nudo',
    kind: 'attach',
    name: l('Atar la cuerda al anclaje', 'Tying the rope to the anchor'),
    aliases: ['atar la cuerda', 'cuerda al árbol', 'anchor knot'],
    uses: ['rappel', 'rescue', 'camp'],
    summary: l('La cuerda directamente alrededor del anclaje, cerrada con un as de guía o un ocho repasado. Ahorra material pero gasta cuerda.', 'The rope tied directly around the anchor with a bowline or a figure-eight follow-through. Saves gear but uses rope.'),
    steps: [
      l('Rodeá el anclaje con la cuerda (una vuelta redonda ayuda a que no se corra).', 'Wrap the rope around the anchor (a round turn helps it stay put).'),
      l('Cerrala con un as de guía asegurado o un ocho repasado.', 'Close it with a backed-up bowline or a figure-eight follow-through.'),
      l('Dejá el nudo a una distancia del anclaje más o menos igual al diámetro del anclaje: pegado, el nudo se deforma al cargarlo.', 'Place the knot about one anchor-diameter away from the anchor: tight against it, the knot distorts under load.'),
    ],
    images: ['cuerda-nudo.webp'],
    check: l('Nudo bien peinado, con cola larga y separado del tronco.', 'Knot well dressed, long tail, set away from the trunk.'),
    mistakes: [l('Nudo apretado contra el árbol.', 'Knot cinched against the tree.')],
    knots: ['ocho-doble', 'as-de-guia', 'vuelta-redonda'],
  },
  {
    id: 'sin-tension',
    kind: 'attach',
    name: l('Anclaje sin tensión', 'Tensionless anchor'),
    aliases: ['sin tensión', 'sin tension', 'tensionless', 'vueltas al árbol'],
    uses: ['rescue', 'rappel', 'cargo'],
    summary: l('Para cargas grandes (pasamanos, cruces de río, tirolesas): las vueltas de la cuerda alrededor del árbol absorben la tensión y el nudo queda sin carga.', 'For big loads (handlines, river crossings, ziplines): the rope wraps around the tree absorb the tension and the knot stays unloaded.'),
    steps: [
      l('Dá al menos cuatro vueltas de cuerda alrededor del árbol, de arriba hacia abajo. Más vueltas si el tronco es liso; con corteza rugosa alcanza con menos.', 'Take at least four wraps around the tree, top to bottom. More if the trunk is smooth; fewer with rough bark.'),
      l('En la punta de la cuerda hacé una gaza fija (ocho con gaza).', 'Tie a fixed loop (figure-eight loop) in the end of the rope.'),
      l('Enganchá la gaza con un mosquetón al tramo de cuerda que va a la carga, sin tensión.', 'Clip the loop with a carabiner back to the loaded strand, loosely.'),
    ],
    images: ['sin-tension.webp'],
    check: l('Con la carga puesta, la gaza y el mosquetón quedan flojos: la tensión la toman las vueltas.', 'Under load, the loop and carabiner stay slack: the wraps take the tension.'),
    mistakes: [l('Pocas vueltas: la tensión llega al nudo.', 'Too few wraps: the tension reaches the knot.')],
    knots: ['ocho-gaza'],
  },
  {
    id: 'prerrepartido',
    kind: 'system',
    name: l('Anclaje de varios puntos repartido (con cordino)', 'Pre-equalized multi-point anchor (cordelette)'),
    aliases: ['repartido', 'ecualizado', 'cordelette', 'pre-equalized', 'reunión', 'dos puntos'],
    uses: ['rappel', 'rescue'],
    summary: l('Une dos o tres puntos con un anillo de cordino o cinta, repartido hacia la dirección de la carga con un nudo. Si falla un punto, no hay tirón.', 'Joins two or three points with a cord or sling loop, equalized toward the load with a knot. If a point fails, there is no shock load.'),
    steps: [
      l('Enganchá el anillo de cordino (cerrado con pescador doble) en cada punto.', 'Clip the cord loop (closed with a double fisherman’s) to each point.'),
      l('Tirá de los tramos entre los puntos hacia la dirección de la carga, juntándolos.', 'Pull the strands between the points down toward the direction of load, gathering them.'),
      l('Con todos los tramos juntos, hacé un nudo simple o un ocho: abajo queda la gaza maestra.', 'With all strands together, tie an overhand or figure eight: the master loop is below it.'),
      l('Colgá todo de la gaza maestra con mosquetón con seguro.', 'Clip everything to the master loop with a locking carabiner.'),
    ],
    images: ['prerrepartido.webp'],
    check: l('Apuntado a la carga, con ángulo menor a 60° y cada brazo tenso.', 'Aimed at the load, with an angle under 60° and every arm tight.'),
    mistakes: [l('Si la carga cambia de dirección, un solo brazo toma todo el peso: repartilo hacia donde de verdad va a tirar.', 'If the load direction changes, one arm takes all the weight: equalize toward where it will really pull.')],
    knots: ['pescador-doble', 'ocho-gaza', 'simple'],
  },
  {
    id: 'autorrepartido',
    kind: 'system',
    name: l('Anclaje autorrepartido', 'Self-equalizing anchor'),
    aliases: ['autoigualado', 'autorrepartido', 'X deslizante', 'self-equalizing', 'sliding X'],
    uses: ['rappel', 'rescue'],
    summary: l('Reparte la carga aunque cambie la dirección (por ejemplo, si el rappel se desvía). Contra: si falla un punto, se alarga y da un tirón al resto.', 'Shares the load even when the direction changes (e.g., a rappel that drifts). Drawback: if a point fails, it extends and shock-loads the rest.'),
    steps: [
      l('Enganchá una cinta a los dos puntos.', 'Clip one sling to both points.'),
      l('Tomá el tramo del medio, dale media vuelta (formando una "X") y enganchá el mosquetón en las dos gazas que quedan.', 'Take the middle strand, give it a half twist (forming an X) and clip the carabiner into both loops formed.'),
      l('Para limitar el alargamiento si falla un punto, hacé un nudo simple en cada brazo, cerca del mosquetón (práctica habitual en escalada, no figura en el manual).', 'To limit extension if a point fails, tie an overhand on each arm near the carabiner (common climbing practice, not in the manual).'),
    ],
    images: ['autorrepartido.webp'],
    check: l('Sin la media vuelta, el mosquetón queda colgando de la cinta suelta: si falla un punto, se sale todo. Revisalo.', 'Without the twist, the carabiner just rides on the loose sling: if a point fails, it all comes off. Check it.'),
    mistakes: [l('Usarlo cuando no hace falta: el manual recomienda el repartido fijo salvo que la dirección cambie.', 'Using it when not needed: the manual recommends a pre-equalized anchor unless the direction changes.')],
    knots: ['simple', 'nudo-cinta'],
  },
  {
    id: 'dos-arboles',
    kind: 'system',
    name: l('Anclaje en dos árboles con ocho de dos gazas', 'Two-tree anchor with a two-loop figure eight'),
    aliases: ['dos árboles', 'dos puntos', 'orejas de conejo'],
    uses: ['rescue', 'rappel'],
    summary: l('Con la propia cuerda: una gaza a cada árbol y la carga repartida entre los dos.', 'With the rope itself: one loop to each tree and the load shared between them.'),
    steps: [
      l('Hacé un ocho de dos gazas en la cuerda.', 'Tie a two-loop figure eight in the rope.'),
      l('Pasá cada gaza alrededor de un árbol (o enganchala a una cinta en cada uno).', 'Put each loop around a tree (or clip it to a sling on each).'),
      l('Ajustá el largo de las gazas para que las dos tiren parejo, con el ángulo cerrado.', 'Adjust the loop lengths so both pull evenly, with a narrow angle.'),
    ],
    images: ['../knots/ocho-dos-gazas-1.webp'],
    check: l('Las dos gazas tensas y el ángulo entre ellas menor a 60°.', 'Both loops tight and the angle between them under 60°.'),
    mistakes: [l('Árboles muy separados: ángulo abierto y mucha carga en cada uno.', 'Trees far apart: wide angle and high load on each.')],
    knots: ['ocho-dos-gazas'],
  },
  {
    id: 'rappel',
    kind: 'system',
    name: l('Anclaje para rappel y recuperar la cuerda', 'Rappel anchor and rope retrieval'),
    aliases: ['rappel', 'descuelgue', 'anillo de abandono', 'maillon', 'recuperar la cuerda'],
    uses: ['rappel'],
    summary: l('Para bajar y poder recuperar la cuerda desde abajo, la cuerda pasa por un anillo metálico (maillon o anillo de rappel) colgado del anclaje.', 'To descend and pull the rope down afterwards, the rope runs through a metal ring (maillon or rappel ring) hung from the anchor.'),
    steps: [
      l('Armá el anclaje (redundante) y colgá de él un maillon o anillo metálico. Nunca pases la cuerda directo por una cinta: al recuperarla el roce la funde.', 'Build the (redundant) anchor and hang a maillon or metal ring from it. Never run the rope directly through a sling: pulling it down melts it.'),
      l('Pasá la cuerda por el anillo hasta la mitad, o uní dos cuerdas con la unión para rappel con el nudo junto al anillo.', 'Thread the rope to its middle, or join two ropes with an offset overhand bend sitting next to the ring.'),
      l('Hacé un nudo de tope en cada punta y comprobá que las dos puntas lleguen al suelo o a la siguiente reunión.', 'Tie a stopper in each end and confirm both ends reach the ground or the next station.'),
      l('Antes de bajar, recordá de qué lado está el nudo de unión: de ese lado se tira para recuperar la cuerda.', 'Before descending, remember which side the joining knot is on: pull that side to retrieve the rope.'),
      l('Abajo, deshacé los nudos de tope y tirá de un solo lado, avisando "¡cuerda!".', 'Below, untie the stoppers and pull one side, shouting "rope!".'),
    ],
    images: [],
    check: l('Machard colocado, nudos de tope hechos y el compañero revisó el sistema.', 'Machard in place, stoppers tied and your partner checked the system.'),
    mistakes: [
      l('Cuerda pasando directo por la cinta.', 'Rope running directly through the sling.'),
      l('Olvidar los nudos de tope.', 'Forgetting the stopper knots.'),
    ],
    knots: ['union-rappel', 'tope', 'machard', 'pescador-doble'],
  },
  {
    id: 'estacas',
    kind: 'improvised',
    name: l('Estacas', 'Pickets (stakes)'),
    aliases: ['estaca', 'piquete', 'picket', 'holdfast', 'estacas en serie'],
    uses: ['camp', 'survival', 'cargo'],
    summary: l('Donde no hay árboles ni rocas, estacas clavadas inclinadas. Varias en serie, amarradas entre sí, aguantan mucho más que una.', 'Where there are no trees or rocks, stakes driven at an angle. Several in series, lashed together, hold far more than one.'),
    steps: [
      l('Clavá cada estaca inclinada al menos 15° hacia el lado contrario al tirón.', 'Drive each stake leaning at least 15° away from the pull.'),
      l('Para cargas pesadas (vehículos, grandes tensiones) el manual pide estacas de al menos 7,5 cm de diámetro y 1,5 m de largo, enterradas 90 cm, separadas 1 a 2 m. Para carpas y lonas alcanzan estacas mucho más chicas.', 'For heavy loads (vehicles, high tension) the manual calls for stakes at least 7.5 cm in diameter and 1.5 m long, driven 90 cm deep, 1–2 m apart. For tents and tarps much smaller stakes do.'),
      l('Amarrá la cabeza de la estaca de adelante (la que recibe el tirón) al pie de la de atrás, con 4 a 6 vueltas de cuerda.', 'Lash the head of the front stake (the one taking the pull) to the base of the one behind, with 4 to 6 turns of rope.'),
      l('Tensá retorciendo las vueltas con un palo y clavá el palo en el suelo para que no se desenrosque.', 'Tighten by twisting the turns with a stick, then drive the stick into the ground so it does not unwind.'),
    ],
    images: ['estacas.webp', 'estacas-armado.webp'],
    check: l('Tirando, la estaca de adelante no se inclina hacia la carga.', 'When pulled, the front stake does not lean toward the load.'),
    mistakes: [l('Clavarla derecha o inclinada hacia la carga: se sale.', 'Driving it upright or leaning toward the load: it pulls out.')],
    knots: ['ballestrinque', 'camionero'],
    table: {
      head: [l('Estacas (tierra común)', 'Stakes (loamy soil)'), l('Aguantan aprox.', 'Hold about')],
      rows: [
        ['1', '320 kg (700 lb)'],
        ['1-1', '635 kg (1400 lb)'],
        ['1-1-1', '815 kg (1800 lb)'],
        ['2-1', '905 kg (2000 lb)'],
        ['3-2-1', '1815 kg (4000 lb)'],
      ],
      note: l('Estacas de madera de 7,5 cm. Suelo húmedo de arcilla y grava: ×0,9; arcilla y arena de río: ×0,5. Fuente: FM 5-125, tabla 4-1.', '7.5 cm wooden stakes. Wet clay and gravel: ×0.9; river clay and sand: ×0.5. Source: FM 5-125, table 4-1.'),
    },
  },
  {
    id: 'hombre-muerto',
    kind: 'improvised',
    name: l('"Hombre muerto" (objeto enterrado)', 'Deadman'),
    aliases: ['hombre muerto', 'muerto', 'enterrado', 'deadman', 'arena', 'nieve'],
    uses: ['camp', 'survival', 'cargo', 'rescue'],
    summary: l('Un objeto largo y firme enterrado en una zanja, con la cuerda saliendo por debajo. Sirve en arena, nieve o tierra blanda, donde las estacas no aguantan.', 'A long, solid object buried in a trench with the rope leading from its underside. Works in sand, snow or soft ground where stakes do not hold.'),
    steps: [
      l('Elegí algo con mucha superficie: un tronco, un manojo de ramas, una roca maciza, o en emergencia esquíes, raquetas o una mochila llena de arena o nieve. Nada podrido.', 'Pick something with a large surface: a log, a bundle of branches, a solid rock, or in an emergency skis, snowshoes or a pack filled with sand or snow. Nothing rotten.'),
      l('Cavá una zanja perpendicular a la dirección de la cuerda. La pared del lado de la carga, socavada unos 15°.', 'Dig a trench at right angles to the rope. The wall facing the load, undercut about 15°.'),
      l('Cavá una canaleta en rampa para que la cuerda salga lo más horizontal posible.', 'Dig a sloping channel so the rope leaves as horizontally as possible.'),
      l('Atá la cuerda al objeto de modo que salga desde abajo (así no rota hacia arriba) y tapalo bien apisonado.', 'Tie the rope so it leads from the bottom of the object (so it does not roll up) and backfill, tamping it down.'),
      l('En suelo de roca dura donde no se puede cavar: apoyalo lo más hundido posible y cargalo con piedras grandes. Aguanta menos: solo para cargas livianas, como un pasamanos para cruzar un arroyo.', 'In hard rock where digging is impossible: set it as low as possible and pile large rocks on it. Weaker: only for light loads, like a handline across a stream.'),
    ],
    images: ['hombre-muerto.webp'],
    check: l('Más hondo y con la cuerda más horizontal, aguanta más.', 'Deeper and with a more horizontal rope, it holds more.'),
    mistakes: [l('Atar la cuerda por arriba del objeto: lo hace girar y salir.', 'Tying the rope to the top of the object: it rotates out.')],
    knots: ['lenador', 'vuelta-redonda', 'ballestrinque'],
  },
  {
    id: 'vehiculo',
    kind: 'improvised',
    name: l('Vehículo', 'Vehicle'),
    aliases: ['auto', 'camioneta', 'vehículo', 'vehicle', 'gancho de remolque'],
    uses: ['rescue', 'cargo', 'survival'],
    summary: l('Un vehículo frenado es un buen punto fijo para sacar otro vehículo o tensar una cuerda.', 'A braked vehicle is a good fixed point to pull out another vehicle or tension a rope.'),
    steps: [
      l('Atá a un gancho de remolque o al chasis, nunca al paragolpes, a la dirección ni a piezas que puedan cortar la cuerda.', 'Tie to a tow hook or the chassis, never to the bumper, steering parts or anything that could cut the rope.'),
      l('Motor apagado, freno de mano puesto, cambio colocado y, si podés, calzas en las ruedas.', 'Engine off, handbrake on, in gear and, if possible, wheels chocked.'),
      l('Protegé la cuerda de bordes metálicos con tela o una manguera.', 'Protect the rope from metal edges with cloth or a hose.'),
      l('Nadie parado en línea con una cuerda tensa: si se corta, latiguea.', 'Nobody standing in line with a taut rope: if it breaks, it whips.'),
    ],
    images: [],
    check: l('El vehículo no se mueve al tensar.', 'The vehicle does not move when tensioned.'),
    mistakes: [l('Usar una cuerda común para remolcar con tirones: se corta y latiguea.', 'Using ordinary rope for jerky towing: it snaps and whips.')],
    knots: ['as-de-guia', 'vuelta-redonda', 'camionero'],
  },
  {
    id: 'carpa',
    kind: 'improvised',
    name: l('Vientos de carpa y lona', 'Tent and tarp guylines'),
    aliases: ['carpa', 'lona', 'vientos', 'tensores', 'tarp', 'guyline'],
    uses: ['camp', 'survival'],
    summary: l('Cómo anclar y tensar carpas y lonas para que aguanten el viento.', 'How to anchor and tension tents and tarps to withstand wind.'),
    steps: [
      l('Estacas inclinadas unos 45°, en contra del tirón, y el viento formando un ángulo parecido con el suelo.', 'Stakes leaning about 45° away from the pull, and the guyline at a similar angle to the ground.'),
      l('En arena o nieve: enterrá la estaca acostada, un palo o una bolsa con arena ("hombre muerto" chico).', 'In sand or snow: bury the stake sideways, a stick or a bag of sand (a small deadman).'),
      l('En roca: atá el viento a una piedra grande con vuelta redonda y cotes, o poné piedras encima de la estaca acostada.', 'On rock: tie the guyline to a large stone with a round turn and half hitches, or pile rocks on a stake laid flat.'),
      l('Tensá con el nudo de camionero y aseguralo con dos cotes; se ajusta fácil si llueve y la cuerda se estira.', 'Tension with a trucker’s hitch and secure it with two half hitches; easy to readjust when rain stretches the line.'),
    ],
    images: [],
    check: l('Con viento, la lona no flamea ni se aflojan los vientos.', 'In wind, the tarp does not flap nor the lines slacken.'),
    mistakes: [l('Estacas derechas en suelo blando: el viento las saca.', 'Upright stakes in soft ground: the wind pulls them out.')],
    knots: ['camionero', 'vuelta-redonda', 'ballestrinque', 'lenador'],
  },
  {
    id: 'probar',
    kind: 'basics',
    name: l('Cómo probar un anclaje', 'How to test an anchor'),
    aliases: ['probar', 'revisar', 'chequeo', 'test'],
    uses: ['rappel', 'rescue', 'camp', 'survival', 'cargo'],
    summary: l('Antes de confiarle una persona, cargalo de a poco y revisalo con otro.', 'Before trusting a person to it, load it gradually and check it with someone else.'),
    steps: [
      l('Mirá cada pieza de punta a punta: puntos, cintas, nudos, mosquetones cerrados, bordes acolchados.', 'Look over every piece end to end: points, slings, knots, locked carabiners, padded edges.'),
      l('Cargalo de a poco en la dirección real de trabajo, todavía con un seguro aparte.', 'Load it gradually in the real working direction, still backed up separately.'),
      l('Observá: nada se mueve, se desliza ni cruje.', 'Watch: nothing moves, slides or creaks.'),
      l('Chequeo cruzado: otra persona revisa todo en voz alta antes de usarlo.', 'Buddy check: someone else checks everything aloud before use.'),
    ],
    images: [],
    check: l('Si algo te hace dudar, rearmalo o sumá otro punto.', 'If anything makes you doubt, rebuild it or add another point.'),
    mistakes: [l('Probarlo con un tirón brusco en una dirección distinta a la de uso.', 'Testing it with a sharp jerk in a direction other than the real one.')],
    knots: [],
  },
];

export const ANCHOR_BY_ID = new Map(ANCHORS.map((a) => [a.id, a]));

/** Anclajes en que se usa un nudo (para la ficha del nudo). */
export function anchorsUsing(knotId: string): Anchor[] {
  return ANCHORS.filter((a) => a.knots.includes(knotId));
}

export const ANCHOR_SOURCES: L = l(
  'Imágenes y datos: FM 3-97.61 Military Mountaineering (2002) y FM 5-125 Rigging Techniques, Procedures and Applications (2001), Ejército de EE. UU., dominio público.',
  'Images and data: FM 3-97.61 Military Mountaineering (2002) and FM 5-125 Rigging Techniques, Procedures and Applications (2001), U.S. Army, public domain.',
);

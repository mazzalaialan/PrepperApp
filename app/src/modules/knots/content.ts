import type { L } from './knots';

/** Asistente "¿Qué necesito hacer?", glosario y cuerdas (ARQUITECTURA §10.2). Textos propios. */

const l = (es: string, en: string): L => ({ es, en });

export interface NeedOption {
  label: L;
  /** Nudos recomendados, el mejor primero. */
  knots: string[];
  /** Anclajes (fichas de Anclajes). */
  anchors?: string[];
  note?: L;
}

export interface Need {
  id: string;
  label: L;
  options: NeedOption[];
}

export const NEEDS: Need[] = [
  {
    id: 'anchor',
    label: l('Armar un punto fijo (anclaje)', 'Build a fixed point (anchor)'),
    options: [
      { label: l('En un árbol o una roca', 'On a tree or a rock'), knots: ['ocho-doble', 'alondra'], anchors: ['arbol', 'bloque', 'cinta', 'sin-tension'] },
      { label: l('Repartido entre dos o tres puntos', 'Shared between two or three points'), knots: ['pescador-doble', 'ocho-dos-gazas'], anchors: ['prerrepartido', 'dos-arboles', 'angulos'] },
      { label: l('Para rappel y recuperar la cuerda', 'For rappelling and pulling the rope down'), knots: ['union-rappel', 'tope'], anchors: ['rappel'] },
      { label: l('Sin árboles ni rocas (arena, nieve, campo abierto)', 'No trees or rocks (sand, snow, open ground)'), knots: ['ballestrinque', 'camionero'], anchors: ['estacas', 'hombre-muerto'] },
    ],
  },
  {
    id: 'loop',
    label: l('Hacer una gaza (un lazo fijo)', 'Make a fixed loop'),
    options: [
      { label: l('En la punta, para atar algo o atarme', 'At the end, to tie onto something or myself'), knots: ['as-de-guia', 'ocho-gaza'] },
      { label: l('Para encordarme al arnés o alrededor de un árbol', 'To tie into a harness or around a tree'), knots: ['ocho-doble'] },
      { label: l('En el medio de la cuerda', 'In the middle of the rope'), knots: ['mariposa', 'ocho-direccional'] },
      { label: l('Dos gazas para repartir carga', 'Two loops to share a load'), knots: ['ocho-dos-gazas', 'as-de-guia-doble'] },
    ],
  },
  {
    id: 'join',
    label: l('Unir dos cuerdas o cintas', 'Join two ropes or slings'),
    options: [
      { label: l('Del mismo grosor, para carga o personas', 'Same thickness, for loads or people'), knots: ['ocho-union', 'pescador-doble'] },
      { label: l('De distinto grosor', 'Different thickness'), knots: ['escota-doble'] },
      { label: l('Dos cuerdas de rappel (que no se trabe al recuperarla)', 'Two rappel ropes (so it does not snag when pulled down)'), knots: ['union-rappel'] },
      { label: l('Cerrar un cordino en anillo', 'Close a cord into a loop'), knots: ['pescador-doble'] },
      { label: l('Cinta plana', 'Flat webbing'), knots: ['nudo-cinta'] },
      { label: l('Las puntas de una misma cuerda (vendaje, paquete)', 'Two ends of the same cord (bandage, bundle)'), knots: ['rizo', 'cirujano'], note: l('No para cargas.', 'Not for loads.') },
    ],
  },
  {
    id: 'tie',
    label: l('Atar a un poste, árbol o anilla', 'Tie to a post, tree or ring'),
    options: [
      { label: l('Que aguante y se suelte fácil', 'Secure and easy to release'), knots: ['vuelta-redonda', 'as-de-guia'] },
      { label: l('Rápido y ajustable (un palo, un mosquetón)', 'Quick and adjustable (a pole, a carabiner)'), knots: ['ballestrinque'] },
      { label: l('Tensar mucho (carga, tendedero, lona)', 'Tension hard (load, clothesline, tarp)'), knots: ['camionero'] },
      { label: l('Arrastrar o levantar un tronco', 'Drag or lift a log'), knots: ['lenador'] },
      {
        label: l('Un lazo que se cierre alrededor de un bulto, una rama o algo lejos', 'A loop that closes around a bundle, a branch or something out of reach'),
        knots: ['corredizo', 'as-de-guia-corredizo'],
        note: l('Nunca alrededor de una persona.', 'Never around a person.'),
      },
      { label: l('Que se suelte de un tirón', 'Released with one pull'), knots: ['escape'], note: l('No para cargas importantes.', 'Not for important loads.') },
      { label: l('Rematar o atar simple a un poste o anilla', 'Simple tie-off to a post or ring'), knots: ['medios-cotes'] },
      { label: l('Vientos de carpa o lona que se ajusten', 'Adjustable tent or tarp guylines'), knots: ['tensor', 'camionero'] },
      { label: l('A una anilla o un ancla, con tirones (náutico)', 'To a ring or anchor, with jerks (nautical)'), knots: ['ancla'] },
      { label: l('Amarrar un bote a una cornamusa', 'Moor a boat to a cleat'), knots: ['cornamusa'] },
      { label: l('Cerrar una bolsa o atar un manojo', 'Close a bag or bind a bundle'), knots: ['constrictor'] },
      { label: l('Una cinta al árbol o al arnés', 'A sling to a tree or harness'), knots: ['alondra'] },
    ],
  },
  {
    id: 'grip',
    label: l('Que se trabe sobre otra cuerda (subir, asegurar)', 'Grip another rope (ascend, back up)'),
    options: [
      { label: l('Seguro de rappel debajo del descensor', 'Rappel backup below the device'), knots: ['machard'] },
      { label: l('Subir por una cuerda o rescate', 'Climb a rope or rescue'), knots: ['prusik', 'bachmann', 'klemheist'] },
      { label: l('Con cinta, si no hay cordino', 'With webbing, if there is no cord'), knots: ['klemheist'] },
    ],
  },
  {
    id: 'brake',
    label: l('Frenar o bajar a alguien sin descensor', 'Brake or lower someone without a device'),
    options: [
      { label: l('Frenar la cuerda en un mosquetón', 'Brake the rope on a carabiner'), knots: ['dinamico'] },
      { label: l('Bloquearlo para tener las manos libres', 'Lock it off to free your hands'), knots: ['mula'] },
      { label: l('Recoger cuerda y que no vuelva', 'Take in rope that will not run back'), knots: ['guarda'] },
      { label: l('Armar un arnés de emergencia', 'Make an emergency harness'), knots: ['asiento-rappel'] },
    ],
  },
  {
    id: 'rescue',
    label: l('Subir o bajar a una persona herida', 'Raise or lower an injured person'),
    options: [
      { label: l('Asiento con gazas para torso y piernas', 'Seat with chest and leg loops'), knots: ['silla-bombero', 'as-de-guia-doble'] },
      { label: l('Armar una camilla con palos', 'Build a stretcher with poles'), knots: ['atadura-cuadrada', 'ballestrinque'] },
      { label: l('Armar una escalera para subir o bajar un desnivel', 'Make a ladder to climb or get down a drop'), knots: ['escalera', 'mariposa'] },
    ],
  },
  {
    id: 'stop',
    label: l('Que la punta no se escape', 'Stop the end from slipping out'),
    options: [
      { label: l('Tope en la punta', 'Stopper at the end'), knots: ['tope', 'simple'] },
      { label: l('Tope que se suelta de un tirón', 'Stopper released with one pull'), knots: ['escape'] },
      { label: l('Tope fácil de desatar (poleas, anillas)', 'Easy-to-untie stopper (pulleys, rings)'), knots: ['ocho-simple'] },
    ],
  },
  {
    id: 'shorten',
    label: l('Acortar una cuerda sin cortarla', 'Shorten a rope without cutting it'),
    options: [
      { label: l('Provisorio, con la cuerda tensa', 'Temporary, with the rope taut'), knots: ['margarita'] },
      { label: l('Guardarla sin que se enrede', 'Store it tangle-free'), knots: ['cadena'] },
    ],
  },
  {
    id: 'build',
    label: l('Armar estructuras con palos', 'Build structures with poles'),
    options: [
      { label: l('Dos palos cruzados', 'Two crossed poles'), knots: ['atadura-cuadrada'] },
      { label: l('Una "A" o bípode', 'An A-frame or bipod'), knots: ['atadura-tijera'] },
      { label: l('Un trípode', 'A tripod'), knots: ['atadura-tripode'] },
      { label: l('Refuerzos en cruz (palos que tienden a separarse)', 'Cross braces (poles that spring apart)'), knots: ['atadura-diagonal'] },
      { label: l('Una escalera de cuerda con travesaños', 'A rope ladder with rungs'), knots: ['escalera', 'ballestrinque'] },
    ],
  },
  {
    id: 'fish',
    label: l('Pescar', 'Fish'),
    options: [{ label: l('Atar el anzuelo o el señuelo', 'Tie on the hook or lure'), knots: ['palomar', 'clinch', 'uni'] }],
  },
];

export interface Term {
  term: L;
  def: L;
}

export const GLOSSARY: Term[] = [
  { term: l('Chicote', 'Working end'), def: l('La punta de la cuerda con la que se hace el nudo.', 'The end of the rope used to tie the knot.') },
  { term: l('Firme', 'Standing part'), def: l('La parte de la cuerda que no se mueve al hacer el nudo (la que va a la carga o al resto de la cuerda).', 'The part that does not move while tying (leading to the load or the rest of the rope).') },
  { term: l('Seno', 'Bight'), def: l('La cuerda doblada en U, sin cruzarse.', 'The rope folded into a U, without crossing.') },
  { term: l('Gaza', 'Loop'), def: l('Un lazo: la cuerda doblada que se cruza sobre sí misma o queda cerrada con un nudo.', 'A loop: rope bent so it crosses itself or is closed by a knot.') },
  { term: l('Vuelta', 'Turn'), def: l('Pasar la cuerda alrededor de algo (un palo, otra cuerda).', 'Passing the rope around something (a pole, another rope).') },
  { term: l('Vuelta redonda', 'Round turn'), def: l('Una vuelta completa y un poco más, que rodea el objeto entero.', 'A full turn and a bit more, fully encircling the object.') },
  { term: l('Cote', 'Half hitch'), def: l('Una vuelta del chicote alrededor del firme, pasándolo por dentro de la gaza que se forma.', 'A turn of the end around the standing part, tucked through the loop it forms.') },
  { term: l('Cola', 'Tail'), def: l('Lo que sobra del chicote después del nudo. En nudos de seguridad, nunca menos de 10 cm.', 'The leftover end after the knot. In life-safety knots, never less than 10 cm.') },
  { term: l('Peinar el nudo', 'Dressing'), def: l('Acomodar los tramos para que queden paralelos y sin cruces antes de ajustarlo.', 'Arranging the strands parallel and uncrossed before tightening.') },
  { term: l('Ajustar', 'Setting'), def: l('Apretar el nudo tirando de cada tramo para que no se mueva al cargarlo.', 'Tightening each strand so the knot does not shift under load.') },
  { term: l('Nudo de seguridad', 'Backup knot'), def: l('Un nudo extra (generalmente un simple) que impide que el chicote se salga.', 'An extra knot (usually an overhand) that keeps the end from pulling out.') },
  { term: l('Autobloqueante', 'Friction hitch'), def: l('Nudo de un cordino sobre una cuerda que se traba al cargarlo y se corre al soltarlo (Prusik, Machard).', 'A cord knot on a rope that grips when loaded and slides when slack (Prusik, Machard).') },
  { term: l('Cordino', 'Accessory cord'), def: l('Cuerda fina (4 a 8 mm) para autobloqueantes y anclajes livianos.', 'Thin rope (4 to 8 mm) for friction hitches and light anchors.') },
  { term: l('Cinta', 'Webbing / sling'), def: l('Cinta plana o tubular, cosida en anillo o atada con nudo de cinta.', 'Flat or tubular webbing, sewn into a loop or tied with a water knot.') },
  { term: l('Mosquetón con seguro', 'Locking carabiner'), def: l('Mosquetón cuyo gatillo se traba con rosca o resorte. Obligatorio para personas.', 'A carabiner whose gate locks by screw or spring. Mandatory for people.') },
  { term: l('Anclaje', 'Anchor'), def: l('El punto fijo del que cuelga el sistema: árbol, roca, chapa. Siempre redundante: nunca uno solo.', 'The fixed point the system hangs from: tree, rock, bolt. Always redundant: never just one.') },
  { term: l('Adujar', 'Coiling'), def: l('Recoger la cuerda en vueltas ordenadas para guardarla o transportarla sin que se enrede.', 'Gathering the rope in tidy coils to store or carry it tangle-free.') },
];

export interface RopeSection {
  title: L;
  items: L[];
}

export const ROPES: RopeSection[] = [
  {
    title: l('Tipos de cuerda', 'Rope types'),
    items: [
      l('Dinámica: se estira (6–10 %) para absorber una caída. Para escalar, no para rappel largo ni para izar.', 'Dynamic: stretches (6–10%) to absorb a fall. For climbing, not for long rappels or hauling.'),
      l('Estática o semiestática: casi no se estira. Para rappel, rescate, izar y pasamanos. Nunca para frenar caídas.', 'Static or semi-static: barely stretches. For rappelling, rescue, hauling and handlines. Never to catch falls.'),
      l('Cordino (4–8 mm): para Prusik, Machard y anclajes livianos. No para colgar personas solo de él.', 'Accessory cord (4–8 mm): for Prusik, Machard and light anchors. Never to hang a person from alone.'),
      l('Paracord 550: liviano, unos 250 kg de rotura. Sus hilos internos sirven de hilo de coser o tanza. No es para personas.', 'Paracord 550: light, about 250 kg breaking strength. Its inner strands work as sewing thread or fishing line. Not for people.'),
      l('Cinta plana o tubular: para anillos de anclaje y arneses improvisados.', 'Flat or tubular webbing: for anchor slings and improvised harnesses.'),
      l('Fibras naturales (sisal, cáñamo, algodón): baratas y agarran bien los nudos, pero se pudren mojadas y son mucho más débiles.', 'Natural fibers (sisal, hemp, cotton): cheap and hold knots well, but rot when wet and are much weaker.'),
      l('Polipropileno: flota (sirve para el agua) pero se degrada al sol y aguanta poco el roce.', 'Polypropylene: floats (good near water) but degrades in sunlight and wears quickly.'),
    ],
  },
  {
    title: l('Resistencia', 'Strength'),
    items: [
      l('Todo nudo debilita la cuerda: le saca entre el 20 y el 50 % de la resistencia.', 'Every knot weakens the rope: by 20 to 50%.'),
      l('Carga de trabajo: usá como mucho entre un quinto y un décimo de la resistencia de rotura que figura en la cuerda.', 'Working load: use at most one fifth to one tenth of the rated breaking strength.'),
      l('Los bordes filosos y el roce cortan una cuerda tensa en segundos: protegé los bordes con tela, una mochila o un tubo.', 'Sharp edges and friction cut a loaded rope in seconds: pad edges with cloth, a pack or a tube.'),
    ],
  },
  {
    title: l('Cuidado', 'Care'),
    items: [
      l('No pisarla: la tierra y la arena entran al alma y la cortan por dentro.', 'Do not step on it: dirt and sand get into the core and cut it from inside.'),
      l('Lavala con agua fría o tibia, sin detergentes fuertes, y secala a la sombra, lejos del calor.', 'Wash it in cold or lukewarm water without harsh detergents and dry it in the shade, away from heat.'),
      l('Lejos de ácidos, nafta, aceite y del sol directo prolongado.', 'Keep it away from acids, fuel, oil and prolonged direct sun.'),
      l('Revisala tocándola de punta a punta: zonas duras, blandas, aplastadas o con la funda rota la dejan fuera de uso.', 'Inspect it by hand end to end: hard, soft, flattened spots or a torn sheath retire it.'),
      l('Las puntas de cuerda sintética se queman para que no se deshilachen; las naturales se atan con hilo (falcaceado).', 'Seal synthetic rope ends by melting them; whip natural fiber ends with twine.'),
      l('Guardala adujada, seca y en una bolsa, lejos de la luz.', 'Store it coiled, dry and bagged, away from light.'),
      l('Una cuerda que frenó una caída fuerte o tiene muchos años de uso se retira.', 'Retire a rope after a severe fall or many years of use.'),
    ],
  },
];

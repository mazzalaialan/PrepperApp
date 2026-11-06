import { A, B, E8, OHZ, coilH, move, offset, rev, scale } from '../helpers.mjs';

const e8 = move(E8, 20, -40);
const e8b = offset(rev(e8), 17); // la azul entra por donde sale el chicote naranja
const oh = move(OHZ, 20, -30);
const ohb = offset(rev(oh), 17);

export default {
  'ocho-union': [
    { ropes: [{ ...A, path: e8 }] },
    { ropes: [{ ...A, path: e8 }, { ...B, path: [[420, 85], ...e8b.slice(1, 9)] }], arrows: [[[250, 25], [200, 30], [175, 60]]] },
    { ropes: [{ ...A, path: e8 }, { ...B, path: [[420, 85], ...e8b.slice(1, -1), [-20, 197]] }], arrows: [[[40, 250], [5, 250]], [[355, 250], [395, 250]]] },
  ],
  'nudo-cinta': [
    { rope: 17, ropes: [{ ...A, path: oh }] },
    { rope: 17, ropes: [{ ...A, path: oh }, { ...B, path: [[420, 60], ...ohb.slice(1, 10)] }], arrows: [[[150, 40], [140, 90], [150, 140]]] },
    { rope: 17, ropes: [{ ...A, path: oh }, { ...B, path: [[420, 60], ...ohb.slice(1, -1), [-20, 163]] }], arrows: [[[40, 230], [5, 230]], [[355, 230], [395, 230]]] },
  ],
  'union-rappel': [
    { ropes: [{ ...A, path: [[-20, 180], [250, 180], [330, 180]] }, { ...B, path: [[-20, 200], [250, 200], [330, 200]] }] },
    { ropes: [{ ...A, path: oh }, { ...B, path: offset(oh, -17) }] },
    { ropes: [{ ...A, path: scale(oh, 0.72, 200, 150) }, { ...B, path: offset(scale(oh, 0.72, 200, 150), -15) }], arrows: [[[40, 240], [5, 240]], [[300, 230], [340, 200]]] },
    { ropes: [{ ...A, path: [...scale(oh, 0.55, 120, 150).slice(0, -1), ...scale(oh, 0.55, 120, 150).slice(2).map(([x, y, zz]) => [x + 85, y - 20, zz])] }, { ...B, path: offset([...scale(oh, 0.55, 120, 150).slice(0, -1), ...scale(oh, 0.55, 120, 150).slice(2).map(([x, y, zz]) => [x + 85, y - 20, zz])], -13) }], rope: 12 },
  ],
};

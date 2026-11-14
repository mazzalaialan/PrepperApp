import { describe, expect, it } from 'vitest';
import { parseUyMarine } from './uruguayMarine';

describe('aviso marino de INUMET', () => {
  const raw = {
    activo: 1,
    fechaInicioValidez: '2026-11-14',
    horaInicioValidez: '00:00',
    fechaEmision: '2026-11-13 23:34:17',
    situacionSinoptica: 'Borde occidental de sistema de alta presión.  ',
    zonasDescripcion: [
      { zonaId: 'RUY', tipo: 'visibilidad', zonaNombre: 'Río Uruguay', descripcion: 'Se formula por neblinas. Validez: desde las 0800 UTC.' },
      { zonaId: 'RDP', tipo: 'viento', zonaNombre: 'Río de la Plata', descripcion: '  ' },
    ],
  };
  it('lee la emisión, la situación sinóptica y los avisos por zona (sin los vacíos)', () => {
    const n = parseUyMarine(raw, 9)!;
    expect(n.active).toBe(true);
    expect(n.issued).toBe('2026-11-13 23:34:17');
    expect(n.validFrom).toBe('2026-11-14 00:00');
    expect(n.synoptic).toBe('Borde occidental de sistema de alta presión.');
    expect(n.warnings).toEqual([{ zone: 'Río Uruguay', kind: 'visibilidad', text: 'Se formula por neblinas. Validez: desde las 0800 UTC.' }]);
    expect(n.fetchedAt).toBe(9);
  });
  it('sin aviso activo o con otro formato', () => {
    expect(parseUyMarine({ ...raw, activo: 0 })!.active).toBe(false);
    expect(parseUyMarine(null)).toBeNull();
    expect(parseUyMarine({ otra: 'cosa' })).toBeNull();
  });
});

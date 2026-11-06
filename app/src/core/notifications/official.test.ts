import { describe, expect, it } from 'vitest';
import { officialNotification, type OfficialPush } from './format';

const base: OfficialPush = {
  key: 'SMN:1:0',
  source: 'SMN',
  senderName: 'Servicio Meteorologico Nacional',
  event: 'Tormentas',
  headline: 'Tormentas',
  severity: 'Severe',
  onset: '2026-11-05T15:00:00-03:00',
  expires: '2026-11-05T20:59:59-03:00',
  here: true,
  fixAt: null,
  places: ['Chacra'],
  stock: ['Galpón'],
  url: 'https://www.smn.gob.ar/alertas',
};

describe('notificación de alerta oficial', () => {
  it('título con el organismo y la severidad; dónde, vigencia, reservas y de quién es', () => {
    const { title, body } = officialNotification(base, 'es');
    expect(title).toBe('SMN: Tormentas (severa)');
    expect(body).toContain('Incluye tu ubicación, Chacra.');
    expect(body).toMatch(/Rige desde .+ hasta .+\./);
    expect(body).toContain('Tenés reserva cerca: Galpón.');
    expect(body).toContain('Alerta oficial de Servicio Meteorologico Nacional.');
  });

  it('en inglés, y sin severidad si el organismo no la da', () => {
    const { title, body } = officialNotification({ ...base, severity: 'Unknown', here: false, stock: [] }, 'en');
    expect(title).toBe('SMN: Tormentas');
    expect(body).toContain('Includes Chacra.');
    expect(body).not.toContain('supplies');
  });
});

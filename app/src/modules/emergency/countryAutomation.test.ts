import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefetchCountry = vi.fn(async (_country: string) => undefined);
let stored = new Set<string>();
vi.mock('./country', () => ({ prefetchCountry: (c: string) => prefetchCountry(c) }));
vi.mock('./dataFile', () => ({ hasDataFile: async (f: string) => stored.has(f) }));

const setNetwork = (type: string | undefined, saveData = false) =>
  Object.defineProperty(navigator, 'connection', { value: type === undefined ? undefined : { type, saveData }, configurable: true });

async function load() {
  return import('./countryAutomation');
}

describe('qué hacer al detectar otro país', () => {
  beforeEach(() => {
    prefetchCountry.mockClear();
    stored = new Set();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('se ofrece cambiar el país solo si el detectado es otro y no se dijo «No, gracias»', async () => {
    const { offerFor } = await load();
    expect(offerFor('PE', 'AR', [])).toBe('PE');
    expect(offerFor('AR', 'AR', [])).toBeNull();
    expect(offerFor(null, 'AR', [])).toBeNull();
    expect(offerFor('PE', 'AR', ['PE'])).toBeNull();
    // Un «No, gracias» a Perú no impide ofrecer Chile.
    expect(offerFor('CL', 'AR', ['PE'])).toBe('CL');
  });

  it('con Wi-Fi baja solo los datos del país y de los vecinos, sin preguntar', async () => {
    const { downloadFor, useCountryNotices } = await load();
    setNetwork('wifi');
    useCountryNotices.setState({ ask: null });
    await downloadFor({ country: 'PE', near: ['BO'] });
    expect(prefetchCountry.mock.calls.map((c) => c[0]).sort()).toEqual(['BO', 'PE']);
    expect(useCountryNotices.getState().ask).toBeNull();
  });

  it('con datos móviles o conexión desconocida pregunta antes, con el peso, y no baja nada', async () => {
    const { downloadFor, useCountryNotices } = await load();
    for (const type of ['cellular', undefined]) {
      setNetwork(type);
      useCountryNotices.setState({ ask: null });
      await downloadFor({ country: 'PE', near: [] });
      expect(prefetchCountry).not.toHaveBeenCalled();
      const ask = useCountryNotices.getState().ask;
      expect(ask?.countries).toEqual(['PE']);
      // Perú pesa varios MB (el paquete más servicios y parques).
      expect(ask!.bytes).toBeGreaterThan(3_000_000);
    }
  });

  it('con el ahorro de datos prendido también pregunta, aunque haya Wi-Fi', async () => {
    const { downloadFor, useCountryNotices } = await load();
    setNetwork('wifi', true);
    useCountryNotices.setState({ ask: null });
    await downloadFor({ country: 'BO', near: [] });
    expect(prefetchCountry).not.toHaveBeenCalled();
    expect(useCountryNotices.getState().ask?.countries).toEqual(['BO']);
  });

  it('«Ahora no» no insiste con la misma descarga en la sesión', async () => {
    const { downloadFor, declineDownload, useCountryNotices } = await load();
    setNetwork('cellular');
    useCountryNotices.setState({ ask: null });
    declineDownload(['UY']);
    await downloadFor({ country: 'UY', near: [] });
    expect(useCountryNotices.getState().ask).toBeNull();
  });

  it('si ya está todo guardado o no hay conexión, no hace nada', async () => {
    const { downloadFor, useCountryNotices } = await load();
    const { countryFiles } = await import('./countryDownload');
    setNetwork('cellular');
    useCountryNotices.setState({ ask: null });
    stored = new Set(countryFiles('CL'));
    await downloadFor({ country: 'CL', near: [] });
    expect(useCountryNotices.getState().ask).toBeNull();
    expect(prefetchCountry).not.toHaveBeenCalled();
    stored = new Set();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await downloadFor({ country: 'PE', near: [] });
    expect(useCountryNotices.getState().ask).toBeNull();
  });
});

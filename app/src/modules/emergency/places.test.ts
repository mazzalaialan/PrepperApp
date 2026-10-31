import { describe, expect, it } from 'vitest';
import data from './places-ar.json';
import { placeFinder } from './places';
import { locateRepeaters, parseRepeaterCsv } from './repeaters';

const places = placeFinder(data as unknown as Parameters<typeof placeFinder>[0]);

describe('nomenclátor de localidades', () => {
  it('ubica por la localidad antes del guion y sin tildes', () => {
    expect(places.find('Lanus')?.label).toBe('Lanús, Buenos Aires');
    expect(places.find('Alta Gracia - Bosque Alegre')?.label).toBe('Alta Gracia, Córdoba');
    expect(places.find('Collon Cura - Cerro Leon, Ruta Nacional 237')).not.toBeNull();
  });

  it('nombres repetidos: gana la provincia nombrada y si no, la ciudad más grande', () => {
    expect(places.find('San Justo, Santa Fe')?.label).toBe('San Justo, Santa Fe');
    expect(places.find('Rosario - Radio Club Rosario')?.label).toBe('Rosario, Santa Fe');
    expect(places.find('Parana')?.label).toBe('Paraná, Entre Ríos');
  });

  it('nombres abreviados o parciales', () => {
    expect(places.find('Bariloche - Cerro Otto')?.label).toBe('San Carlos de Bariloche, Río Negro');
    expect(places.find('S. Fernando Valle de Catamarca - Cerro Ancasti')?.label).toMatch(/Catamarca$/);
  });

  it('solo cubre Argentina', () => {
    expect(places.covers('Argentina')).toBe(true);
    expect(places.covers('Santa Fe')).toBe(true);
    expect(places.covers('Texas')).toBe(false);
  });

  it('exportación de RepeaterBook sin coordenadas: quedan ubicadas y marcadas como aproximadas', async () => {
    const csv = [
      'Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes,Digital Access',
      '432.17500,437.175000,,,,LW4DAE,"Lanus",,Argentina,FM EchoLink ,',
      '145.21000,144.610000,,100.0,,LU8HPM,"Salsipuedes",,Argentina,FM ,',
      '145.00000,144.400000,,,,XX1X,"Zzzz Inexistente",,Argentina,FM ,',
      '146.00000,146.600000,,,,W5ABC,"Austin",,Texas,FM ,',
    ].join('\n');
    const located = await locateRepeaters(parseRepeaterCsv(csv));
    const [lanus, salsipuedes, missing, texas] = located!;
    expect(lanus).toMatchObject({ approx: 'Lanús, Buenos Aires' });
    expect(lanus!.lat).toBeCloseTo(-34.7, 0);
    expect(salsipuedes!.approx).toMatch(/Córdoba$/);
    expect(missing).toMatchObject({ lat: null, approx: null });
    expect(texas).toMatchObject({ lat: null, approx: null });
    // Ya buscadas: no se vuelven a procesar.
    expect(await locateRepeaters(located!)).toBeNull();
  });
});

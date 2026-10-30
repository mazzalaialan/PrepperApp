import { describe, expect, it } from 'vitest';
import {
  WrongSecretError,
  generateDek,
  generateRecoveryKey,
  normalizeRecoveryKey,
  openJson,
  sealJson,
  unwrapDek,
  wrapDek,
} from './crypto';

// Iteraciones bajas para que los tests sean rápidos; la lógica es la misma.
const FAST = 1_000;

describe('crypto', () => {
  it('cifra y descifra JSON', async () => {
    const dek = await generateDek();
    const value = { name: 'Atún', qty: 12, tags: ['lata'] };
    const sealed = await sealJson(dek, value);
    expect(await openJson(dek, sealed)).toEqual(value);
  });

  it('usa un IV distinto en cada cifrado', async () => {
    const dek = await generateDek();
    const a = await sealJson(dek, 'x');
    const b = await sealJson(dek, 'x');
    expect(a.iv).not.toEqual(b.iv);
  });

  it('envuelve y recupera la DEK con el secreto correcto', async () => {
    const dek = await generateDek();
    const sealed = await sealJson(dek, 'secreto');
    const wrapped = await wrapDek(dek, 'contraseña-larga', FAST);
    const recovered = await unwrapDek(wrapped, 'contraseña-larga');
    expect(await openJson(recovered, sealed)).toBe('secreto');
  });

  it('rechaza un secreto incorrecto', async () => {
    const wrapped = await wrapDek(await generateDek(), 'correcta', FAST);
    await expect(unwrapDek(wrapped, 'incorrecta')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('genera claves de recuperación legibles y las normaliza', () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
    expect(key).not.toMatch(/[01OIL]/);
    expect(normalizeRecoveryKey(key.toLowerCase().replaceAll('-', ' '))).toBe(key.replaceAll('-', ''));
  });
});

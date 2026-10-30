/** Lee un número tipeado por el usuario; acepta coma decimal. Vacío o inválido = `null`. */
export function parseNum(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
}

export function numToInput(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

// Peso de cada archivo de public/data/, para avisar cuánto se baja al detectar un país nuevo (src/modules/emergency/data-sizes.json).
// Volver a correrlo cuando se regeneren los paquetes: `npm run data-sizes`. Una prueba avisa si quedó desactualizado.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/data/', import.meta.url));
const sizes = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f, statSync(dir + f).size]),
);
writeFileSync(fileURLToPath(new URL('../src/modules/emergency/data-sizes.json', import.meta.url)), JSON.stringify(sizes, null, 1) + '\n');
console.log(`${Object.keys(sizes).length} archivos`);

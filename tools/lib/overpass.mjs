/**
 * Consultas a Overpass (OpenStreetMap) para las herramientas de datos.
 *
 * Con `node:https` y no con `fetch`: Overpass a veces tarda 25–30 s en
 * aceptar la conexión cuando está cargado, y Node corta antes (el `fetch`, a
 * los 10 s; y al probar IPv4 e IPv6 a la vez le da solo 250 ms a cada
 * dirección). Así fallaban Chile y los parques de Chile en la actualización
 * automática. Acá se conecta por IPv4 sin ese corte, se espera hasta 60 s la
 * conexión y hasta 6 min la respuesta, y se reintenta por los dos servidores.
 */
import { request } from 'node:https';

export const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/PrepperApp)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST de un formulario; resuelve con { status, body }. */
function post(url, form, { connectMs = 60_000, totalMs = 360_000 } = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(form);
    const req = request(url, { method: 'POST', family: 4, autoSelectFamily: false, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    const total = setTimeout(() => req.destroy(new Error(`sin respuesta en ${totalMs / 1000} s`)), totalMs);
    req.on('socket', (s) => {
      const connect = setTimeout(() => req.destroy(new Error(`no conectó en ${connectMs / 1000} s`)), connectMs);
      s.once('secureConnect', () => clearTimeout(connect));
      s.once('close', () => clearTimeout(connect));
    });
    req.on('close', () => clearTimeout(total));
    req.on('error', reject);
    req.end(body);
  });
}

/** Elementos de una consulta Overpass QL; hasta `rounds` vueltas por los dos servidores. */
export async function overpass(query, { rounds = 3, waitMs = 30_000 } = {}) {
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(waitMs);
    for (const url of OVERPASS) {
      try {
        const res = await post(url, `data=${encodeURIComponent(query)}`);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data = JSON.parse(res.body);
        if (data.remark && !data.elements?.length) throw new Error(data.remark);
        return data.elements;
      } catch (err) {
        console.warn(`Overpass ${url}: ${err.message}`);
      }
    }
  }
  throw new Error('Overpass no respondió');
}

import type { Db } from './db.ts';

/**
 * Borrado de una cuenta pedido por mail (quien ya no tiene la app). Borra el
 * dispositivo y, en cascada, todo lo suyo, igual que "Eliminar mi cuenta":
 *
 *   docker compose exec vikarg node src/deleteDevice.ts <código de dispositivo>
 */
export function deleteDevice(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadConfig } = await import('./config.ts');
  const { openDb } = await import('./db.ts');
  const id = process.argv[2]?.trim();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    console.error('Uso: node src/deleteDevice.ts <código de dispositivo (UUID)>');
    process.exitCode = 1;
  } else {
    const db = openDb(loadConfig().dataDir);
    console.log(deleteDevice(db, id.toLowerCase()) ? `Borrado ${id} con todos sus datos.` : `No existe ningún dispositivo ${id}.`);
    db.close();
  }
}

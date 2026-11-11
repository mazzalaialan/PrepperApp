import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Dialog } from '@/ui/Dialog';
import { deliverFile } from '@/ui/files';

export interface ExportFormats {
  /** Nombre del archivo, sin extensión. */
  name: string;
  gpx: () => string;
  kml: () => string;
}

const fileName = (name: string, fallback: string) => name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || fallback;

/**
 * Un solo botón para sacar un recorrido o una ruta: abre un cuadro para elegir GPX (Strava, Garmin, Wikiloc…) o KML (Google Earth y Maps).
 * `kind` solo cambia el rótulo: «Exportar recorrido» (track grabado) o «Exportar ruta» (ruta planificada).
 */
export function ExportPathButton({ kind, formats, testId }: { kind: 'track' | 'route'; formats: ExportFormats; testId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  async function save(ext: 'gpx' | 'kml') {
    const text = ext === 'gpx' ? formats.gpx() : formats.kml();
    const mime = ext === 'gpx' ? 'application/gpx+xml' : 'application/vnd.google-earth.kml+xml';
    try {
      await deliverFile(new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>, `${fileName(formats.name, kind === 'track' ? 'recorrido' : 'ruta')}.${ext}`, mime);
      setOpen(false);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
  }

  return (
    <>
      <button className="btn" type="button" data-testid={testId} onClick={() => setOpen(true)}>
        <Download size={18} /> {t(kind === 'track' ? 'exportPath.track' : 'exportPath.route')}
      </button>
      {open && (
        <Dialog title={t(kind === 'track' ? 'exportPath.track' : 'exportPath.route')} onClose={() => setOpen(false)}>
          <div className="stack" data-testid="export-dialog">
            <p className="hint" style={{ margin: 0 }}>{t('exportPath.intro')}</p>
            <button className="btn btn-primary" type="button" data-testid="export-gpx" onClick={() => void save('gpx')}>
              <Download size={18} /> GPX
            </button>
            <p className="hint" style={{ margin: 0 }}>{t('exportPath.gpxHint')}</p>
            <button className="btn" type="button" data-testid="export-kml" onClick={() => void save('kml')}>
              <Download size={18} /> KML
            </button>
            <p className="hint" style={{ margin: 0 }}>{t('exportPath.kmlHint')}</p>
          </div>
        </Dialog>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { Dialog } from '@/ui/Dialog';
import { deliverFile } from '@/ui/files';
import { gridLabel, gridStepM, paperMm, scaleEquivalence, type Orientation } from './geometry';
import { DEFAULT_SCALE, planSheet, scaleChoices, type TopoSheetInput } from './plan';

const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'mapa';
const fmtScale = (n: number) => n.toLocaleString('es-AR');

/**
 * Cuadro de opciones antes de generar el mapa topográfico: título, escala (las que no entran, en gris), hoja y marcas.
 * El dibujo y el PDF se cargan recién al tocar «Generar» (el código viaja en el paquete: anda sin conexión).
 */
export function PrintTopoDialog({ input, onClose }: { input: TopoSheetInput; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(input.title);
  const [orientation, setOrientation] = useState<'auto' | Orientation>('auto');
  const [scale, setScale] = useState<number | null>(null);
  const [latLon, setLatLon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo<TopoSheetInput>(() => ({ ...input, title: title.trim() || input.title, orientation, latLonTicks: latLon }), [input, title, orientation, latLon]);
  const choices = useMemo(() => scaleChoices(base), [base]);
  const extent = useMemo(() => planSheet(base).extentM, [base]);
  const defaultScale = choices.find((c) => c.fits && c.scale >= DEFAULT_SCALE)?.scale ?? null;
  // La escala elegida vale mientras entre; si al cambiar la hoja ya no entra, vuelve a la de por defecto.
  const chosen = scale !== null && choices.find((c) => c.scale === scale)?.fits ? scale : defaultScale;
  const anyFits = choices.some((c) => c.fits);

  async function generate() {
    if (chosen === null) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { makeTopoPdf } = await import('./compose');
      const { pdf, scale: used } = await makeTopoPdf({ ...base, scale: chosen });
      await deliverFile(pdf as Uint8Array<ArrayBuffer>, `${slug(base.title)}-1-${used}.pdf`, 'application/pdf');
      setDone(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const code = err instanceof Error ? err.message : '';
      setError(t(code === 'NO_FIT' ? 'topoPrint.fitError' : code === 'MAP_TIMEOUT' ? 'topoPrint.mapTimeout' : 'topoPrint.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={t('topoPrint.title')} onClose={onClose}>
      <div data-testid="topo-dialog" className="stack">
        <p className="hint" style={{ margin: 0 }}>{t('topoPrint.intro')}</p>
        <div className="field">
          <label htmlFor="topo-title">{t('topoPrint.name')}</label>
          <input id="topo-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </div>

        <div className="field">
          <label id="topo-scale-label">{t('topoPrint.scale')}</label>
          <div className="chips" role="group" aria-labelledby="topo-scale-label" data-testid="topo-scales">
            {choices.map((c) => (
              <button
                key={c.scale}
                type="button"
                className="chip"
                aria-pressed={chosen === c.scale}
                disabled={!c.fits}
                title={c.fits ? scaleEquivalence(c.scale) : t('topoPrint.fitError')}
                data-testid={`topo-scale-${c.scale}`}
                onClick={() => setScale(c.scale)}
              >
                1:{fmtScale(c.scale)}
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }} data-testid="topo-route-size">
            {t('topoPrint.routeSize', { east: (extent.east / 1000).toFixed(1).replace('.', ','), north: (extent.north / 1000).toFixed(1).replace('.', ',') })}
          </p>
          {anyFits ? (
            <p className="hint" style={{ margin: 0 }}>{t('topoPrint.scaleHint')}</p>
          ) : (
            <p className="error" role="alert" data-testid="topo-nofit">{t('topoPrint.noFit')}</p>
          )}
          {chosen !== null && (
            <p className="hint" style={{ margin: 0 }} data-testid="topo-scale-info">
              {t('topoPrint.scaleInfo', { scale: fmtScale(chosen), equivalence: scaleEquivalence(chosen), grid: gridLabel(chosen), mm: Math.round(paperMm(gridStepM(chosen), chosen)) })}
            </p>
          )}
        </div>

        <div className="field">
          <label id="topo-orient-label">{t('topoPrint.orientation')}</label>
          <div className="segmented" role="group" aria-labelledby="topo-orient-label">
            {(['auto', 'portrait', 'landscape'] as const).map((o) => (
              <button key={o} type="button" aria-pressed={orientation === o} onClick={() => setOrientation(o)} data-testid={`topo-orient-${o}`}>
                {t(`topoPrint.${o}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={latLon} onChange={(e) => setLatLon(e.target.checked)} data-testid="topo-latlon" />
          {t('topoPrint.latLon')}
        </label>
        <p className="hint" style={{ margin: 0 }}>{t('topoPrint.offline')}</p>
        <p className="hint" style={{ margin: 0 }}>{t('topoPrint.notOfficial')}</p>
        {error && <p className="error" role="alert" data-testid="topo-error">{error}</p>}
        {done && <p className="ok" role="status" data-testid="topo-done">{t('topoPrint.done')}</p>}
        {busy && <p className="hint" role="status" data-testid="topo-busy">{t('topoPrint.generating')}</p>}
        <div className="row-end">
          <button className="btn" type="button" onClick={onClose}>{t('common.close')}</button>
          <button className="btn btn-primary" type="button" disabled={busy || chosen === null} onClick={() => void generate()} data-testid="topo-generate">
            <Printer size={18} aria-hidden /> {t('topoPrint.generate')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, Trash2 } from 'lucide-react';
import { ImportFailure, importPmtiles, listImported, removeImported, type ImportedMap } from './imported';

/** Vista que muestra todo lo que cubre un archivo. */
export function boundsView(b: ImportedMap['bounds']): { lat: number; lon: number; zoom: number } {
  const [w, s, e, n] = b;
  const lat = (s + n) / 2;
  const span = Math.max(n - s, (e - w) * Math.cos((lat * Math.PI) / 180), 0.01);
  return { lat, lon: (w + e) / 2, zoom: Math.min(12, Math.max(2, Math.log2(360 / span) - 1)) };
}

/**
 * Mapas importados a mano (.pmtiles): se eligen del almacenamiento del
 * celular y se leen directo, sin conexión (ver imported.ts).
 */
export function ImportedMaps({ onShow, onChange }: { onShow: (view: { lat: number; lon: number; zoom: number }) => void; onChange?: (list: ImportedMap[]) => void }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<ImportedMap[] | null>(null);
  const [progress, setProgress] = useState<{ copied: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const supported = typeof navigator.storage?.getDirectory === 'function';

  const refresh = async () => {
    const l = await listImported();
    setList(l);
    onChange?.(l);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const mb = (bytes: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: bytes < 10 * 1024 * 1024 ? 1 : 0 }).format(bytes / 1024 / 1024);

  async function handleFile(file: File) {
    setMessage(null);
    setProgress({ copied: 0, total: file.size });
    try {
      const info = await importPmtiles(file, (copied, total) => setProgress({ copied, total }));
      setMessage({ text: t('maps.imported.done', { name: info.name, kind: t(`maps.imported.kinds.${info.kind}`) }), error: false });
      onShow(boundsView(info.bounds));
    } catch (e) {
      setMessage({ text: t(`maps.imported.errors.${e instanceof ImportFailure ? e.reason : 'other'}`), error: true });
    } finally {
      setProgress(null);
      await refresh();
    }
  }

  async function handleRemove(m: ImportedMap) {
    if (!window.confirm(t('maps.imported.confirmDelete', { name: m.name }))) return;
    await removeImported(m.name);
    await refresh();
  }

  return (
    <section className="card stack" aria-labelledby="maps-imported">
      <h2 id="maps-imported" className="section-title" style={{ margin: 0 }}>{t('maps.imported.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('maps.imported.hint')}</p>
      {message && (
        <p className={message.error ? 'error' : 'hint'} role="status" style={{ margin: 0 }} data-testid="import-message">
          {message.text}
        </p>
      )}
      {progress ? (
        <div role="status" aria-live="polite">
          <span className="progress">
            <span className="progress-bar" style={{ width: `${(100 * progress.copied) / Math.max(1, progress.total)}%` }} />
          </span>
          <span className="hint">{t('maps.imported.copying', { done: mb(progress.copied), total: mb(progress.total) })}</span>
        </div>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept=".pmtiles"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <button className="btn" type="button" onClick={() => input.current?.click()} disabled={!supported}>
            <FileUp size={18} /> {t('maps.imported.button')}
          </button>
          {!supported && <p className="hint" style={{ margin: 0 }}>{t('maps.imported.errors.noStorage')}</p>}
        </>
      )}
      {list && list.length > 0 && (
        <ul className="list" data-testid="imported-list">
          {list.map((m) => (
            <li key={m.name} className="list-row">
              <button className="list-main zone-go" type="button" onClick={() => onShow(boundsView(m.bounds))}>
                <span className="list-title">{m.name}</span>
                <span className="list-sub">
                  {t('maps.imported.summary', { kind: t(`maps.imported.kinds.${m.kind}`), min: m.minZoom, max: m.maxZoom, mb: mb(m.bytes) })}
                </span>
              </button>
              <button className="icon-btn" type="button" onClick={() => void handleRemove(m)} aria-label={t('maps.imported.delete', { name: m.name })}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

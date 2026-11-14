import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { Track } from '@/core/model/types';
import { formatDistance } from '@/core/units/units';
import { isMine, selectableTracks, TRACK_PALETTE, TRACK_SHOW_MODES, tracksToShow } from './trackSelect';

/** Cuántos se listan antes de «Ver todos» (con tres salidas por semana la lista crece rápido). */
const FIRST = 8;

/**
 * Qué recorridos se dibujan en el mapa: automático (el que se graba o el último), elegir, todos o ninguno.
 * Cuando hay varios a la vez, cada uno lleva un color distinto (el mismo de su casilla).
 */
export function TrackPicker({ tracks, recordingActive }: { tracks: Iterable<Track>; recordingActive: boolean }) {
  const { t, i18n } = useTranslation();
  const mode = useSettings((s) => s.settings.mapTracksMode);
  const chosen = useSettings((s) => s.settings.mapTracksChosen);
  const units = useSettings((s) => s.settings.units);
  const update = useSettings((s) => s.update);
  const [all, setAll] = useState(false);
  const showImported = useSettings((s) => s.settings.mapImportedShow);
  const everything = selectableTracks(tracks);
  const importedCount = everything.filter((x) => !isMine(x)).length;
  const list = everything.filter(isMine);
  if (everything.length === 0) return null;
  // El color de cada uno es su lugar entre los que se ven, el mismo que usa el mapa.
  const shown = tracksToShow(everything, mode, chosen, recordingActive, [], showImported);
  const shownMine = shown.filter(isMine);
  const colorOf = (id: string) => {
    const i = shown.findIndex((x) => x.id === id);
    return i < 0 ? null : (TRACK_PALETTE[i % TRACK_PALETTE.length] ?? null);
  };
  const toggle = (id: string) => void update({ mapTracksChosen: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
  const visible = all ? list : list.slice(0, FIRST);
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="track-picker">
      <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>{t('maps.trackPicker.title')}</h3>
      {importedCount > 0 && (
        <label className="check" data-testid="track-imported-toggle">
          <input type="checkbox" checked={showImported} onChange={(e) => void update({ mapImportedShow: e.target.checked })} />
          <span className="list-main">
            <span className="list-title">{t('maps.trackPicker.imported', { count: importedCount })}</span>
            <span className="list-sub">{t('maps.trackPicker.importedHint')}</span>
          </span>
        </label>
      )}
      {list.length > 0 && (
        <>
      <h4 className="section-title" style={{ margin: 0, fontSize: '0.95rem' }}>{t('maps.trackPicker.mine')}</h4>
      <div className="chips" role="group" aria-label={t('maps.trackPicker.mine')}>
        {TRACK_SHOW_MODES.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => void update({ mapTracksMode: m })} data-testid={`track-mode-${m}`}>
            {t(`maps.trackPicker.mode.${m}`)}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }} data-testid="track-mode-hint">
        {t(`maps.trackPicker.hint.${mode}`, { count: shownMine.length })}
      </p>
      {mode === 'chosen' && (
        <>
          <ul className="list" data-testid="track-choices">
            {visible.map((tr) => {
              const color = colorOf(tr.id);
              return (
                <li key={tr.id}>
                  <label className="check">
                    <input type="checkbox" checked={chosen.includes(tr.id)} onChange={() => toggle(tr.id)} />
                    <span className="track-swatch" style={{ background: color ?? 'transparent', borderColor: color ?? 'var(--border)' }} aria-hidden />
                    <span className="list-main">
                      <span className="list-title">{tr.name}</span>
                      <span className="list-sub">
                        {new Date(tr.createdAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' })} · {formatDistance(tr.distanceM, units, i18n.language)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="row-end wrap">
            {list.length > FIRST && (
              <button className="btn-link" type="button" onClick={() => setAll(!all)}>
                {t(all ? 'maps.trackPicker.fewer' : 'maps.trackPicker.more', { count: list.length })}
              </button>
            )}
            {chosen.length > 0 && (
              <button className="btn-link" type="button" onClick={() => void update({ mapTracksChosen: [] })}>
                {t('maps.trackPicker.clear')}
              </button>
            )}
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}

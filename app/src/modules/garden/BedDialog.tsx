import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed } from 'lucide-react';
import { currentPosition } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { GardenBed, Waypoint } from '@/core/model/types';
import { useWaypoints } from '@/modules/waypoints/store';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { Segmented } from '@/ui/Segmented';
import { gridSize } from './logic';

/** Alta y edición de un cantero o maceta, con su waypoint (de ahí salen la helada y la lluvia). */
export function BedDialog({ bed, onClose, onSave, onDelete }: { bed: GardenBed; onClose: () => void; onSave: (b: GardenBed) => Promise<void>; onDelete?: () => void }) {
  const { t } = useTranslation();
  const waypoints = useWaypoints((s) => s.waypoints);
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const [draft, setDraft] = useState(bed);
  const [width, setWidth] = useState(numToInput(bed.widthCm));
  const [length, setLength] = useState(numToInput(bed.lengthCm));
  const [sun, setSun] = useState(numToInput(bed.sunHours));
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const w = parseNum(width);
  const l = parseNum(length);
  const h = parseNum(sun);
  const valid = draft.name.trim() !== '' && w !== null && w >= 10 && w <= 3000 && l !== null && l >= 10 && l <= 10000 && h !== null && h >= 0 && h <= 16;
  const options = [...waypoints.values()].sort((a, b) => a.name.localeCompare(b.name));
  const size = valid ? gridSize({ widthCm: w!, lengthCm: l! }) : null;

  async function markHere() {
    setLocating(true);
    setGpsError(false);
    try {
      const fix = await currentPosition();
      const wp = newEntity<Waypoint>({ name: draft.name.trim() || t('garden.bedDefault', { n: 1 }), lat: fix.lat, lon: fix.lon, alt: fix.alt, icon: 'pin', notes: '', rainAlerts: false });
      await saveWaypoint(wp);
      setDraft((d) => ({ ...d, waypointId: wp.id }));
    } catch {
      setGpsError(true);
    } finally {
      setLocating(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void onSave({ ...draft, name: draft.name.trim(), widthCm: w!, lengthCm: l!, sunHours: h! });
  }

  return (
    <Dialog
      title={t(bed.createdAt === bed.updatedAt && !onDelete ? 'garden.newBed' : 'garden.editBed')}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn btn-danger-outline" type="button" onClick={onDelete}>
              {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit" form="bed-form" disabled={!valid}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="bed-form" className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="bed-name">{t('garden.bedName')}</label>
          <input id="bed-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} />
        </div>
        <Segmented
          label={t('garden.bedKind')}
          value={draft.kind}
          options={[
            { value: 'bed', label: t('garden.kindBed') },
            { value: 'pot', label: t('garden.kindPot') },
          ]}
          onChange={(kind) => setDraft({ ...draft, kind })}
        />
        <div className="grid-2">
          <div className="field">
            <label htmlFor="bed-width">{t('garden.widthCm')}</label>
            <input id="bed-width" className="input" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bed-length">{t('garden.lengthCm')}</label>
            <input id="bed-length" className="input" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
        </div>
        {size && <p className="hint" style={{ margin: 0 }}>{t('garden.gridHint', { cols: size.cols, rows: size.rows })}</p>}
        <div className="field">
          <label htmlFor="bed-sun">{t('garden.sunHours')}</label>
          <input id="bed-sun" className="input" inputMode="decimal" value={sun} onChange={(e) => setSun(e.target.value)} />
          <p className="hint">{t('garden.sunHint')}</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={draft.greenhouse} onChange={(e) => setDraft({ ...draft, greenhouse: e.target.checked })} data-testid="bed-greenhouse" />
          {t('garden.inGreenhouse')}
        </label>
        <p className="hint" style={{ margin: 0 }}>{t('garden.greenhouseHint')}</p>
        <div className="field">
          <label htmlFor="bed-place">{t('garden.bedPlace')}</label>
          <select id="bed-place" className="select" value={draft.waypointId ?? ''} onChange={(e) => setDraft({ ...draft, waypointId: e.target.value || null })}>
            <option value="">{t('garden.noPlace')}</option>
            {options.map((wp) => (
              <option key={wp.id} value={wp.id}>
                {wp.name}
              </option>
            ))}
          </select>
          <button className="btn" type="button" onClick={() => void markHere()} disabled={locating}>
            <LocateFixed size={18} /> {locating ? t('garden.locating') : t('garden.markHere')}
          </button>
          {gpsError && <p className="error">{t('garden.gpsError')}</p>}
          <p className="hint">{draft.greenhouse ? t('garden.placeHintGreenhouse') : t('garden.placeHint')}</p>
        </div>
        <div className="field">
          <label htmlFor="bed-notes">{t('garden.notes')}</label>
          <textarea id="bed-notes" className="textarea" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} />
        </div>
      </form>
    </Dialog>
  );
}

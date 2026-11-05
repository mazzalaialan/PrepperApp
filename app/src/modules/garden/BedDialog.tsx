import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { GardenBed } from '@/core/model/types';
import { WaypointField } from '@/modules/waypoints/WaypointField';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { Segmented } from '@/ui/Segmented';
import { gridSize } from './logic';

/** Alta y edición de un cantero o maceta, con su waypoint (de ahí salen la helada y la lluvia). */
export function BedDialog({ bed, onClose, onSave, onDelete }: { bed: GardenBed; onClose: () => void; onSave: (b: GardenBed) => Promise<void>; onDelete?: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(bed);
  const [width, setWidth] = useState(numToInput(bed.widthCm));
  const [length, setLength] = useState(numToInput(bed.lengthCm));
  const [sun, setSun] = useState(numToInput(bed.sunHours));
  const w = parseNum(width);
  const l = parseNum(length);
  const h = parseNum(sun);
  const valid = draft.name.trim() !== '' && w !== null && w >= 10 && w <= 3000 && l !== null && l >= 10 && l <= 10000 && h !== null && h >= 0 && h <= 16;
  const size = valid ? gridSize({ widthCm: w!, lengthCm: l! }) : null;

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
        <WaypointField
          id="bed-place"
          label={t('garden.bedPlace')}
          value={draft.waypointId}
          onChange={(waypointId) => setDraft((d) => ({ ...d, waypointId }))}
          newName={draft.name}
          noneLabel={t('garden.noPlace')}
          hint={draft.greenhouse ? t('garden.placeHintGreenhouse') : t('garden.placeHint')}
        />
        <div className="field">
          <label htmlFor="bed-notes">{t('garden.notes')}</label>
          <textarea id="bed-notes" className="textarea" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} />
        </div>
      </form>
    </Dialog>
  );
}

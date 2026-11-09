import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { cardinalOf } from '@/core/geo/geo';
import type { GardenBed } from '@/core/model/types';
import type { Place } from '@/modules/astronomy/sky';
import { CROP_BY_ID, cropName } from './crops';
import { cropHeightCm } from './heights';
import { planLayout, shadedBy, sunDirection } from './layout';
import { gridSize } from './logic';
import { FAMILY_COLOR } from './parts';
import { CropSelect } from './PlantingDialog';

const abbr = (name: string) => name.slice(0, 2);

/**
 * "Qué cultivar": se eligen varias plantas y se propone en qué cuadros va cada una
 * para que las altas no le tapen el sol a las bajas; también avisa si lo ya plantado
 * se está tapando.
 */
export function LayoutPlanner({
  bed,
  place,
  owners,
  suggested,
  onPlant,
}: {
  bed: GardenBed;
  place: Place | null;
  /** Cuadro → cultivo de lo que ya está plantado. */
  owners: Map<number, string>;
  /** Cultivos recomendados ahora (para elegir rápido). */
  suggested: string[];
  onPlant: (cropId: string, cells: number[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [chosen, setChosen] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [run, setRun] = useState(false);
  const { cols, rows } = gridSize(bed);
  const hasBearing = bed.bearingDeg !== null && bed.bearingDeg !== undefined;

  const free = useMemo(() => Array.from({ length: cols * rows }, (_, i) => i).filter((c) => !owners.has(c)), [cols, rows, owners]);
  const sun = useMemo(() => (place && hasBearing ? sunDirection(bed, place, new Date()) : null), [bed, place, hasBearing]);
  const tooTall = useMemo(() => (sun ? shadedBy(bed, owners, sun) : []), [bed, owners, sun]);

  const each = chosen.length ? Math.max(1, Math.floor(free.length / chosen.length)) : 0;
  const plan = useMemo(
    () => (run && sun ? planLayout(bed, free, chosen.map((c) => ({ cropId: c, cells: counts[c] ?? each })), sun) : null),
    [run, sun, bed, free, chosen, counts, each],
  );

  function toggle(id: string) {
    setRun(false);
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  const name = (id: string) => {
    const c = CROP_BY_ID.get(id);
    return c ? cropName(c, lang) : id;
  };
  const dir = (deg: number) => t(`geo.cardinal.${cardinalOf(deg)}`);

  return (
    <section className="card stack" aria-labelledby="bed-layout" data-testid="bed-layout">
      <h2 id="bed-layout" className="section-title" style={{ margin: 0 }}>{t('garden.layout.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('garden.layout.hint')}</p>

      {!place && <p className="warning-box">{t('garden.sun.needPlace')}</p>}
      {place && !hasBearing && <p className="warning-box">{t('garden.layout.needBearing')}</p>}

      {sun && (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {t('garden.layout.sunFrom', { dir: dir(sun.fromDeg), alt: Math.round(sun.noonAltitude) })}
          </p>
          {tooTall.length > 0 && (
            <div className="warning-box" data-testid="layout-clash">
              {tooTall.map((x) => t('garden.layout.clash', { tall: name(x.by), short: name(x.shaded), dir: dir(sun.fromDeg + 180) })).join(' ')}
            </div>
          )}
        </>
      )}

      <div className="stack" style={{ gap: 6 }}>
        {suggested.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {suggested.slice(0, 10).map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={chosen.includes(id)} onClick={() => toggle(id)}>
                {name(id)}
              </button>
            ))}
          </div>
        )}
        <label htmlFor="layout-add">{t('garden.layout.add')}</label>
        <CropSelect
          id="layout-add"
          value=""
          preferred={suggested.slice(0, 8)}
          onChange={(id) => {
            if (!chosen.includes(id)) toggle(id);
          }}
        />
      </div>

      {chosen.length > 0 && (
        <ul className="list" data-testid="layout-chosen">
          {chosen.map((id) => (
            <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span className="garden-dot" style={{ background: FAMILY_COLOR[CROP_BY_ID.get(id)!.family] }} aria-hidden />
              <span style={{ flex: 1 }}>
                {name(id)} <span className="hint">({cropHeightCm(id)} cm)</span>
              </span>
              <input
                className="input"
                style={{ width: 70 }}
                inputMode="numeric"
                aria-label={t('garden.layout.cells', { crop: name(id) })}
                value={counts[id] ?? each}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  setRun(false);
                  setCounts((c) => ({ ...c, [id]: Number.isFinite(n) && n > 0 ? n : 1 }));
                }}
              />
              <span className="hint">{t('garden.layout.cellsUnit')}</span>
              <button className="icon-btn" type="button" onClick={() => toggle(id)} aria-label={t('common.delete')}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && <p className="hint" style={{ margin: 0 }}>{t('garden.layout.freeCells', { count: free.length })}</p>}

      <button className="btn btn-primary" type="button" disabled={!sun || chosen.length === 0 || free.length === 0} onClick={() => setRun(true)} data-testid="layout-run">
        {t('garden.layout.run')}
      </button>

      {plan && sun && (
        <div className="stack" data-testid="layout-result">
          <p className="hint" style={{ margin: 0 }}>{t('garden.layout.gridNote', { dir: dir(bed.bearingDeg ?? 0), shadow: dir(plan.shadowDeg) })}</p>
          <div className="garden-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols * rows }, (_, cell) => {
              const id = plan.assignment.get(cell);
              const owner = owners.get(cell);
              const crop = CROP_BY_ID.get(id ?? owner ?? '');
              return (
                <div key={cell} className={`garden-cell${owner ? ' taken' : ''}`} style={crop ? { background: FAMILY_COLOR[crop.family], opacity: owner ? 0.45 : 1 } : undefined} aria-hidden>
                  {crop ? abbr(cropName(crop, lang)) : ''}
                </div>
              );
            })}
          </div>
          <ul className="list">
            {plan.order.map((id) => {
              const cells = [...plan.assignment].filter(([, c]) => c === id).map(([cell]) => cell);
              const shadow = plan.shadowCm.get(id);
              return (
                <li key={id} style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1 }}>
                      <strong>{name(id)}</strong> · {t('garden.layout.cellsCount', { count: cells.length })}
                      {shadow ? <span className="hint"> · {t('garden.layout.shadow', { cm: shadow, dir: dir(plan.shadowDeg) })}</span> : null}
                    </span>
                    <button className="btn" type="button" disabled={cells.length === 0} onClick={() => onPlant(id, cells)} data-testid={`layout-plant-${id}`}>
                      {t('garden.layout.plant')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {plan.leftOut.length > 0 && <p className="warning-box">{t('garden.layout.leftOut', { list: plan.leftOut.map(name).join(', ') })}</p>}
          <p className="hint" style={{ margin: 0 }}>{t('garden.layout.note')}</p>
        </div>
      )}
    </section>
  );
}

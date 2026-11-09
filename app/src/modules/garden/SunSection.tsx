import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Plus, Trash2 } from 'lucide-react';
import { cardinalOf, normalizeDeg } from '@/core/geo/geo';
import type { GardenBed, BedSide, SunObstacle } from '@/core/model/types';
import { v7 as uuidv7 } from 'uuid';
import { useHeading } from '@/core/sensors/useHeading';
import { numToInput, parseNum } from '@/ui/numbers';
import { Segmented } from '@/ui/Segmented';
import type { Place } from '@/modules/astronomy/sky';
import { BED_SIDES, bedSun, roundHalf } from './sun';

const OBSTACLE_HEIGHTS = [15, 30, 45, 60] as const;
const SHADE_OPTIONS = [0, 30, 50, 70] as const;

/**
 * Lectura de la brújula para tomar un rumbo con el celular apoyado: se ve el
 * rumbo geográfico (con la declinación del lugar) y se fija con un toque.
 */
function HeadingCapture({ place, label, onPick }: { place: Place | null; label: string; onPick: (deg: number) => void }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  const fix = place ? { lat: place.lat, lon: place.lon, alt: null, altAccuracy: null, accuracy: 0, timestamp: 0 } : null;
  const heading = useHeading(fix, on);
  const deg = heading ? Math.round(heading.trueHeading ?? heading.heading) % 360 : null;
  if (!on) {
    return (
      <button className="btn" type="button" onClick={() => setOn(true)} aria-label={label} title={label}>
        <Compass size={18} aria-hidden /> {t('garden.sun.useCompass')}
      </button>
    );
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="hint" style={{ margin: 0 }}>
        {deg === null ? t('garden.sun.noCompass') : t('garden.sun.compassNow', { deg, dir: t(`geo.cardinal.${cardinalOf(deg)}`) })}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={deg === null}
          onClick={() => {
            onPick(deg!);
            setOn(false);
          }}
        >
          {t('garden.sun.fix')}
        </button>
        <button className="btn" type="button" onClick={() => setOn(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function DegInput({ id, label, value, onChange }: { id: string; label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(numToInput(value));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          onChange(n === null ? null : normalizeDeg(Math.round(n)));
        }}
      />
    </div>
  );
}

/** Sol del cantero según su entorno: rumbo, paredes, obstáculos y malla (se guarda en el cantero). */
export function SunSection({ draft, setDraft, place }: { draft: GardenBed; setDraft: (f: (d: GardenBed) => GardenBed) => void; place: Place | null }) {
  const { t } = useTranslation();
  const bearing = draft.bearingDeg ?? null;
  const obstacles = draft.obstacles ?? [];
  const walls = draft.walls ?? {};
  const sun = place ? bedSun(draft, place) : null;
  const bearingKey = bearing === null ? 'none' : String(bearing);

  const sideName = (side: BedSide) => {
    const base = t(`garden.sun.side.${side}`);
    if (bearing === null) return base;
    const off = { front: 0, right: 90, back: 180, left: 270 }[side];
    return `${base} (${t(`geo.cardinal.${cardinalOf(bearing + off)}`)})`;
  };

  function setWall(side: BedSide, cm: number | null) {
    setDraft((d) => {
      const next = { ...(d.walls ?? {}) };
      if (cm === null) delete next[side];
      else next[side] = cm;
      return { ...d, walls: next };
    });
  }
  function setObstacle(id: string, patch: Partial<SunObstacle>) {
    setDraft((d) => ({ ...d, obstacles: (d.obstacles ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }

  return (
    <div className="stack" data-testid="bed-sun-calc">
      {!place && <p className="warning-box">{t('garden.sun.needPlace')}</p>}

      <div className="field" key={`bearing-${bearingKey}`}>
        <DegInput id="bed-bearing" label={t('garden.sun.bearing')} value={bearing} onChange={(v) => setDraft((d) => ({ ...d, bearingDeg: v }))} />
        <HeadingCapture place={place} label={t('garden.sun.useCompass')} onPick={(deg) => setDraft((d) => ({ ...d, bearingDeg: deg }))} />
        <p className="hint">{bearing === null ? t('garden.sun.bearingHint') : t('garden.sun.bearingIs', { dir: t(`geo.cardinal.${cardinalOf(bearing)}`) })}</p>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{t('garden.sun.walls')}</legend>
        <p className="hint" style={{ margin: 0 }}>{bearing === null ? t('garden.sun.wallsNeedBearing') : t('garden.sun.wallsHint')}</p>
        {BED_SIDES.map((side) => {
          const cm = walls[side];
          return (
            <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label className="check" style={{ flex: 1, minWidth: 140 }}>
                <input type="checkbox" disabled={bearing === null} checked={cm !== undefined} onChange={(e) => setWall(side, e.target.checked ? 200 : null)} data-testid={`wall-${side}`} />
                {sideName(side)}
              </label>
              {cm !== undefined && (
                <input
                  className="input"
                  style={{ width: 110 }}
                  inputMode="numeric"
                  aria-label={t('garden.sun.wallHeight')}
                  defaultValue={cm}
                  onChange={(e) => {
                    const n = parseNum(e.target.value);
                    if (n !== null && n > 0 && n <= 2000) setWall(side, n);
                  }}
                />
              )}
              {cm !== undefined && <span className="hint">cm</span>}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{t('garden.sun.obstacles')}</legend>
        <p className="hint" style={{ margin: 0 }}>{t('garden.sun.obstaclesHint')}</p>
        {obstacles.map((o, i) => (
          <div key={o.id} className="card stack" data-testid="obstacle">
            <div className="grid-2">
              <div key={`f-${o.fromDeg}`}>
                <DegInput id={`ob-from-${i}`} label={t('garden.sun.from')} value={o.fromDeg} onChange={(v) => v !== null && setObstacle(o.id, { fromDeg: v })} />
                <HeadingCapture place={place} label={t('garden.sun.from')} onPick={(deg) => setObstacle(o.id, { fromDeg: deg })} />
              </div>
              <div key={`t-${o.toDeg}`}>
                <DegInput id={`ob-to-${i}`} label={t('garden.sun.to')} value={o.toDeg} onChange={(v) => v !== null && setObstacle(o.id, { toDeg: v })} />
                <HeadingCapture place={place} label={t('garden.sun.to')} onPick={(deg) => setObstacle(o.id, { toDeg: deg })} />
              </div>
            </div>
            <Segmented
              label={t('garden.sun.height')}
              value={String(o.heightDeg)}
              options={OBSTACLE_HEIGHTS.map((h) => ({ value: String(h), label: t(`garden.sun.h${h}`) }))}
              onChange={(v) => setObstacle(o.id, { heightDeg: Number(v) })}
            />
            <button className="btn btn-danger-outline" type="button" onClick={() => setDraft((d) => ({ ...d, obstacles: (d.obstacles ?? []).filter((x) => x.id !== o.id) }))}>
              <Trash2 size={16} aria-hidden /> {t('common.delete')}
            </button>
          </div>
        ))}
        <button
          className="btn"
          type="button"
          data-testid="add-obstacle"
          onClick={() => setDraft((d) => ({ ...d, obstacles: [...(d.obstacles ?? []), { id: uuidv7(), fromDeg: 0, toDeg: 90, heightDeg: 30 }] }))}
        >
          <Plus size={16} aria-hidden /> {t('garden.sun.addObstacle')}
        </button>
      </fieldset>

      <Segmented
        label={t('garden.sun.shade')}
        value={String(draft.shadePct ?? 0)}
        options={SHADE_OPTIONS.map((p) => ({ value: String(p), label: t(`garden.sun.shade${p}`) }))}
        onChange={(v) => setDraft((d) => ({ ...d, shadePct: Number(v) }))}
      />

      {sun && (
        <div className="card" data-testid="bed-sun-result">
          <strong>{t('garden.sun.result', { h: roundHalf(sun.equinox.hours) })}</strong>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {t('garden.sun.resultDetail', { today: roundHalf(sun.today.hours), summer: roundHalf(sun.summer.hours), winter: roundHalf(sun.winter.hours) })}
          </p>
          <p className="hint" style={{ margin: '4px 0 0' }}>{t('garden.sun.resultNote')}</p>
        </div>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { LapMark } from '@/core/model/types';
import { useTrainingFormat } from './format';
import { fastestSlowest, lapRows } from './laps';
import { formatClock } from './stats';

/** Las vueltas marcadas: tiempo, distancia y ritmo de cada una, con la más rápida y la más lenta resaltadas. */
export function LapTable({ marks, last }: { marks: LapMark[] | undefined; last?: number }) {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const all = lapRows(marks);
  if (all.length === 0) return null;
  const mark = fastestSlowest(all);
  const rows = last ? all.slice(-last) : all;
  return (
    <table className="bmi-table" data-testid="lap-table">
      <caption>{t('laps.title')}</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">{t('laps.time')}</th>
          <th scope="col">{t('laps.distance')}</th>
          <th scope="col">{t('laps.pace')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.n} aria-current={mark && (r.n === mark.fastest) ? 'true' : undefined}>
            <td>{r.n}{mark && r.n === mark.fastest ? ' ▲' : mark && r.n === mark.slowest ? ' ▼' : ''}</td>
            <td>{formatClock(r.timeS)}</td>
            <td>{f.distance(r.distanceM)}</td>
            <td>{r.paceSPerKm > 0 ? f.pace(r.paceSPerKm) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

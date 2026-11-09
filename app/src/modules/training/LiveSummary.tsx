import { useTranslation } from 'react-i18next';
import { useTrainingFormat } from './format';
import { formatClock } from './stats';
import { useLiveStats } from './useLiveStats';

/**
 * Los datos de la sesión en curso, en compacto, para ponerlos en otras
 * pantallas (por ejemplo, al seguir un track o una ruta). No muestra nada si
 * no se está grabando una sesión de Entrenamiento.
 */
export function LiveSummary() {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const live = useLiveStats();
  if (!live) return null;
  const tiles: [string, string][] = [
    [t('training.live.time'), formatClock(live.elapsed)],
    [t('training.distance'), f.distance(live.stats.distanceM)],
    [t(live.def.measure === 'pace' ? 'training.live.paceNow' : 'training.live.speedNow'), live.effortNow],
    [t(live.def.measure === 'pace' ? 'training.live.paceAvg' : 'training.live.speedAvg'), live.effortAvg],
    [t('training.live.ascent'), f.altitude(live.stats.ascentM)],
    [t('training.live.calories'), live.kcal === null ? '—' : f.kcal(live.kcal)],
  ];
  return (
    <section className="card stack" data-testid="live-summary" aria-label={t('training.live.title')}>
      <p className="live-kind" style={{ margin: 0 }}>
        {f.kindName(live.kind)} · {t(live.status === 'recording' ? 'tracks.rec.recording' : 'tracks.rec.paused')}
      </p>
      <dl className="track-stats">
        {tiles.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import { Navigation } from 'lucide-react';

/**
 * Botones sobre el mapa: 3D o plano, y la vista siguiéndote o libre.
 * Van abajo a la derecha, encima del de "ir a mi ubicación" si lo hay.
 */
export function CameraButtons({
  threeD,
  onThreeD,
  follow,
  onFollow,
  canFollow,
}: {
  threeD: boolean;
  onThreeD: (on: boolean) => void;
  follow: boolean;
  onFollow: (on: boolean) => void;
  canFollow: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="maps-camera">
      <button
        className="icon-btn maps-camera-btn"
        type="button"
        aria-pressed={threeD}
        onClick={() => onThreeD(!threeD)}
        aria-label={t('maps.camera.threeD')}
        title={threeD ? t('maps.camera.to2d') : t('maps.camera.to3d')}
      >
        <span className="maps-camera-text">{threeD ? '3D' : '2D'}</span>
      </button>
      <button
        className="icon-btn maps-camera-btn"
        type="button"
        aria-pressed={follow}
        disabled={!canFollow}
        onClick={() => onFollow(!follow)}
        aria-label={t('maps.camera.follow')}
        title={follow ? t('maps.camera.toFree') : t('maps.camera.toFollow')}
      >
        <Navigation size={20} />
      </button>
    </div>
  );
}

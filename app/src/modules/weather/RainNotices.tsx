import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CloudRain, X } from 'lucide-react';
import { useRainWatch } from './rainWatch';

/** Avisos de lluvia de esta sesión, arriba de todo, hasta que se cierran. */
export function RainNotices() {
  const { t } = useTranslation();
  const notices = useRainWatch((s) => s.notices);
  const dismiss = useRainWatch((s) => s.dismiss);
  if (notices.length === 0) return null;
  return (
    <div className="rain-notices" role="status">
      {notices.map((n) => (
        <div key={n.placeId} className="rain-notice">
          <CloudRain size={20} aria-hidden />
          <Link to="/weather/forecast">
            {n.outlook.state === 'raining'
              ? t('rainAlerts.rainingTitle', { place: n.label })
              : n.outlook.state === 'soon'
                ? t('rainAlerts.soonTitle', { place: n.label, minutes: n.outlook.inMinutes })
                : null}
          </Link>
          <button className="icon-btn" type="button" onClick={() => dismiss(n.placeId)} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

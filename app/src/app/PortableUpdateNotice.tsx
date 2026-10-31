import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import { newerRelease, usePortableUpdate } from '@/core/portable/update';

/** Aviso arriba de todo cuando hay una versión nueva del paquete portable. */
export function PortableUpdateNotice() {
  const { t } = useTranslation();
  const { portable, latest, dismissed, dismiss } = usePortableUpdate();
  const newer = portable ? newerRelease(latest, __APP_VERSION__) : null;
  if (!newer || dismissed === newer.version) return null;
  return (
    <div className="rain-notices" role="status">
      <div className="rain-notice update-notice">
        <Download size={20} aria-hidden />
        <span className="update-text">
          <a href={newer.downloadUrl} target="_blank" rel="noreferrer">
            {t('portable.newVersion', { version: newer.version })}
          </a>
          <span className="hint">{t('portable.howTo')}</span>
        </span>
        <button className="icon-btn" type="button" onClick={dismiss} aria-label={t('common.close')}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

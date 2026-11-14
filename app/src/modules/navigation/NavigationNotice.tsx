import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';

/** Aviso fijo de toda la sección Navegación: son datos orientativos, nunca oficiales. */
export function NavigationNotice() {
  const { t } = useTranslation();
  return (
    <p className="rain-notice" role="note" data-testid="navigation-notice" style={{ margin: 0 }}>
      <TriangleAlert size={20} aria-hidden />
      <span className="update-text">
        <strong>{t('navigation.noticeTitle')}</strong>
        <span className="hint">{t('navigation.notice')}</span>
      </span>
    </p>
  );
}

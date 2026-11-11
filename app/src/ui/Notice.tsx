import type { CSSProperties, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';

/**
 * Avisos que se pueden dar por leídos: un botón «Entendido» los oculta y no vuelven
 * a ocupar la pantalla (queda guardado en Ajustes, en este dispositivo; Ajustes →
 * «Mostrar de nuevo los avisos» los trae otra vez). No sirve para avisos de estado
 * (alertas, errores, pasos que hay que hacer) ni para los que la ley o una licencia
 * obligan a mostrar (aviso del SMN, atribuciones de datos).
 */
export function useNotice(id: string): { hidden: boolean; dismiss: () => void } {
  const dismissed = useSettings((s) => s.settings.dismissedNotices);
  const update = useSettings((s) => s.update);
  return {
    hidden: dismissed.includes(id),
    dismiss: () => void update({ dismissedNotices: [...new Set([...dismissed, id])] }),
  };
}

export function DismissNoticeButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button className="btn-link notice-dismiss" type="button" onClick={onClick} data-testid="notice-dismiss">
      <Check size={14} aria-hidden /> {t('notice.dismiss')}
    </button>
  );
}

export function Notice({
  id,
  variant = 'hint',
  testId,
  style,
  dismissible = true,
  children,
}: {
  id: string;
  /** `hint`: texto chico y gris; `warning`: recuadro con borde de aviso. */
  variant?: 'hint' | 'warning';
  testId?: string;
  style?: CSSProperties;
  /** `false`: el aviso no se puede ocultar (por ejemplo, el de beta de los nudos, para que se sepa cuándo se revisaron). */
  dismissible?: boolean;
  children: ReactNode;
}) {
  const { hidden, dismiss } = useNotice(id);
  if (hidden && dismissible) return null;
  return (
    <div className={`notice ${variant === 'warning' ? 'warning-box' : 'hint'}`} style={{ margin: 0, ...style }} data-testid={testId} data-notice={id}>
      <div className="notice-body">{children}</div>
      {dismissible && <DismissNoticeButton onClick={dismiss} />}
    </div>
  );
}

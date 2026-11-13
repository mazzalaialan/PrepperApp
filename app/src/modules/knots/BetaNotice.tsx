import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';

/**
 * Aviso de que el paso a paso de los nudos es beta y puede tener errores: bien visible (recuadro grande de color de
 * advertencia, con ícono) y SIN botón para ocultarlo. Mientras sea beta tiene que verse siempre; cuando una persona
 * revise todos los nudos se saca, para que quien usa la app sepa que ya están revisados. Con enlace para avisar de un error.
 * Va en la entrada de la Guía de nudos, en la ficha de cada nudo y en el modo práctica.
 */
export function BetaNotice({ name, n, testId, onNavigate }: { name: string; n?: number; testId: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="beta-banner" role="note" data-testid={testId} data-notice="knots.beta">
      <TriangleAlert size={28} aria-hidden className="beta-banner-icon" />
      <div className="beta-banner-body">
        <p className="beta-banner-title">
          <span className="beta-banner-pill">{t('knots.betaPill')}</span> {t('knots.beta')}
        </p>
        <p className="beta-banner-sub">{t('knots.betaNotReviewed')}</p>
        <Link
          className="btn btn-small beta-banner-link"
          to={`/about?${new URLSearchParams({ tipo: 'bug', texto: n ? t('knots.betaReport', { name, n }) : t('knots.betaReportGeneral', { name }) }).toString()}`}
          onClick={onNavigate}
        >
          {t('knots.betaLink')}
        </Link>
      </div>
    </div>
  );
}

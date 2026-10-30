import { useTranslation } from 'react-i18next';

const LOGO = `${import.meta.env.BASE_URL}brand/logo-256.webp`;

export function BrandHeader() {
  const { t } = useTranslation();
  return (
    <div className="gate-brand">
      <img src={LOGO} alt="" />
      <h1>{t('app.name')}</h1>
      <p className="motto">{t('app.motto')}</p>
    </div>
  );
}

export function BrandMark() {
  return <img src={LOGO} alt="" />;
}

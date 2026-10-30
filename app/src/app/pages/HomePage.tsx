import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { ModuleGrid } from '@/ui/ModuleGrid';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <>
      <section className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <BellRing size={24} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-hidden />
        <div>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{t('home.alertsTitle')}</h2>
          <p className="hint">{t('home.alertsEmpty')}</p>
        </div>
      </section>
      <h2 className="section-title">{t('sections.inventory')}</h2>
      <ModuleGrid section="inventory" />
      <h2 className="section-title">{t('sections.field')}</h2>
      <ModuleGrid section="field" />
      <h2 className="section-title">{t('sections.library')}</h2>
      <ModuleGrid section="library" />
    </>
  );
}

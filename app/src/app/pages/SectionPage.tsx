import { useTranslation } from 'react-i18next';
import type { Section } from '@/modules/registry';
import { ModuleGrid } from '@/ui/ModuleGrid';

export function SectionPage({ section }: { section: Section }) {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="page-title">{t(`sections.${section}`)}</h1>
      <ModuleGrid section={section} />
    </>
  );
}

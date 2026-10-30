import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { MODULES, moduleStatus, type ModuleStatus, type Section } from '@/modules/registry';

export function ModuleGrid({ section }: { section: Section }) {
  const { t } = useTranslation();
  const caps = useCapabilities((s) => s.caps);
  const capNames = (list: string[]) => list.map((c) => t(`capabilities.${c}`)).join(', ');

  function badge(status: ModuleStatus): string | null {
    switch (status.kind) {
      case 'available':
        return null;
      case 'soon':
        return t('status.soon', { phase: status.phase });
      case 'unavailable':
        return t('status.unavailable', { caps: capNames(status.missing) });
      case 'degraded':
        return t('status.degraded', { caps: capNames(status.missing) });
    }
  }

  return (
    <div className="module-grid">
      {MODULES.filter((m) => m.section === section).map((m) => {
        // Mientras se detectan las capacidades, se asume que están para no parpadear a "no disponible".
        const status: ModuleStatus = caps
          ? moduleStatus(m, caps)
          : m.implemented
            ? { kind: 'available' }
            : { kind: 'soon', phase: m.phase };
        const Icon = m.icon;
        const label = badge(status);
        const body: ReactNode = (
          <>
            <Icon className="icon" size={28} aria-hidden />
            <h3>{t(`modules.${m.id}.title`)}</h3>
            <p>{t(`modules.${m.id}.desc`)}</p>
            {label && <span className="badge">{label}</span>}
          </>
        );
        const usable = m.path && (status.kind === 'available' || status.kind === 'degraded');
        return usable ? (
          <Link key={m.id} to={m.path!} className="module-card" data-status={status.kind}>
            {body}
          </Link>
        ) : (
          <article key={m.id} className="module-card" data-status={status.kind}>
            {body}
          </article>
        );
      })}
    </div>
  );
}

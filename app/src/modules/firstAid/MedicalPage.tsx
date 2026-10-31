import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { HeartPulse, Plus, TriangleAlert } from 'lucide-react';
import { today } from '@/modules/inventory/domain/dates';
import { ageOn, useMedical } from './medicalStore';

export function MedicalPage() {
  const { t, i18n } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const rows = useMemo(
    () => [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [profiles, i18n.language],
  );
  const todayStr = today();

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.medical.title')}</h1>
        <Link className="btn btn-primary" to="/first-aid/medical/new">
          <Plus size={20} /> {t('medical.new')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{t('medical.empty')}</p>
      ) : (
        <ul className="list">
          {rows.map((p) => {
            const facts = [
              p.birthDate ? t('medical.age', { count: ageOn(p.birthDate, todayStr) }) : null,
              p.bloodType ? t('medical.bloodShort', { type: p.bloodType }) : null,
              p.medications.length ? t('medical.medCount', { count: p.medications.length }) : null,
            ].filter(Boolean);
            return (
              <li key={p.id}>
                <Link className="list-row" to={`/first-aid/medical/${p.id}`}>
                  <HeartPulse size={22} aria-hidden style={{ color: 'var(--danger)', flex: 'none' }} />
                  <span className="list-main">
                    <span className="list-title">{p.name}</span>
                    {facts.length > 0 && <span className="list-sub">{facts.join(' · ')}</span>}
                    {p.allergies.trim() && (
                      <span className="list-sub allergy">
                        <TriangleAlert size={14} aria-hidden /> {t('medical.allergyShort', { text: p.allergies.trim() })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint" style={{ marginTop: 16 }}>{t('medical.privacy')}</p>
    </>
  );
}

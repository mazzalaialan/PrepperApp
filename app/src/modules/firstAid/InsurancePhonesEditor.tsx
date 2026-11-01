import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import type { InsurancePhone } from '@/core/model/types';

/** Teléfonos de una obra social, cada uno con su nombre ("Riesgo de vida", "Emergencias"…). */
export function InsurancePhonesEditor({ phones, onChange }: { phones: InsurancePhone[]; onChange: (phones: InsurancePhone[]) => void }) {
  const { t } = useTranslation();
  const setPhone = (index: number, changes: Partial<InsurancePhone>) => onChange(phones.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  return (
    <>
      <h3 className="contact-group-title">{t('medical.insurance.phones')}</h3>
      <datalist id="insurance-phone-labels">
        {(t('medical.insurance.phoneLabels', { returnObjects: true }) as string[]).map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {phones.map((p, i) => (
        <div key={i} className="ec-row ins-phone-row" data-testid="insurance-phone">
          <input
            className="input"
            list="insurance-phone-labels"
            aria-label={t('medical.insurance.phoneLabel', { n: i + 1 })}
            placeholder={t('medical.insurance.phoneLabelPlaceholder')}
            value={p.label}
            onChange={(e) => setPhone(i, { label: e.target.value })}
          />
          <input
            className="input"
            type="tel"
            inputMode="tel"
            aria-label={t('medical.insurance.phoneNumber', { n: i + 1 })}
            placeholder={t('medical.doctors.phone')}
            value={p.number}
            onChange={(e) => setPhone(i, { number: e.target.value })}
          />
          <button className="icon-btn" type="button" onClick={() => onChange(phones.filter((_, j) => j !== i))} aria-label={t('medical.insurance.removePhone')}>
            <X size={16} />
          </button>
        </div>
      ))}
      <div className="row-end">
        <button className="btn" type="button" onClick={() => onChange([...phones, { label: phones.length === 0 ? t('medical.insurance.firstPhoneLabel') : '', number: '' }])}>
          <Plus size={18} /> {t('medical.insurance.addPhone')}
        </button>
      </div>
    </>
  );
}

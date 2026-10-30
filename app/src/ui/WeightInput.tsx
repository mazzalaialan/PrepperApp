import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import { weightUnitsFor, type WeightUnit } from '@/core/units/units';

interface Props {
  id: string;
  value: string;
  unit: WeightUnit;
  onChange: (value: string, unit: WeightUnit) => void;
}

/** Número + unidad (g/kg u oz/lb según Ajustes). El llamador convierte con `toGrams`. */
export function WeightInput({ id, value, unit, onChange }: Props) {
  const { t } = useTranslation();
  const system = useSettings((s) => s.settings.units);
  return (
    <div className="input-group">
      <input id={id} className="input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value, unit)} />
      <select className="select" value={unit} onChange={(e) => onChange(value, e.target.value as WeightUnit)} aria-label={t('items.weightUnit')}>
        {weightUnitsFor(system).map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

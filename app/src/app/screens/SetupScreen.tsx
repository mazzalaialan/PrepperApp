import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/core/i18n/i18n';
import { useVault } from '@/core/security/useVault';
import { LANGUAGES, useSettings, type Language } from '@/core/settings/settings';
import { BrandHeader } from '@/ui/Brand';
import { NewPasswordForm } from '@/ui/NewPasswordForm';
import { Segmented } from '@/ui/Segmented';

export function SetupScreen() {
  const { t } = useTranslation();
  const create = useVault((s) => s.create);
  const language = useSettings((s) => s.settings.language);
  const update = useSettings((s) => s.update);

  function changeLanguage(lang: Language) {
    setLanguage(lang);
    void update({ language: lang });
  }

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        <div className="card stack">
          <h2>{t('setup.welcome')}</h2>
          <Segmented
            label={t('setup.language')}
            value={language}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
            onChange={changeLanguage}
          />
          <p className="hint">{t('setup.intro')}</p>
          <NewPasswordForm submitLabel={t('setup.create')} busyLabel={t('setup.creating')} onSubmit={create} />
        </div>
      </div>
    </main>
  );
}

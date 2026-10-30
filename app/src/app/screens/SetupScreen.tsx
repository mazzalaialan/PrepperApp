import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/core/i18n/i18n';
import { useVault } from '@/core/security/useVault';
import { LANGUAGES, useSettings, type Language } from '@/core/settings/settings';
import { RestoreForm } from '@/modules/backup/RestoreForm';
import { BrandHeader } from '@/ui/Brand';
import { NewPasswordForm } from '@/ui/NewPasswordForm';
import { Segmented } from '@/ui/Segmented';

export function SetupScreen() {
  const { t } = useTranslation();
  const create = useVault((s) => s.create);
  const language = useSettings((s) => s.settings.language);
  const update = useSettings((s) => s.update);
  const [restoring, setRestoring] = useState(false);

  function changeLanguage(lang: Language) {
    setLanguage(lang);
    void update({ language: lang });
  }

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        <div className="card stack">
          <h2>{restoring ? t('setup.restoreTitle') : t('setup.welcome')}</h2>
          <Segmented
            label={t('setup.language')}
            value={language}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
            onChange={changeLanguage}
          />
          {restoring ? (
            <>
              <p className="hint">{t('setup.restoreIntro')}</p>
              <RestoreForm replacesData={false} />
            </>
          ) : (
            <>
              <p className="hint">{t('setup.intro')}</p>
              <NewPasswordForm submitLabel={t('setup.create')} busyLabel={t('setup.creating')} onSubmit={create} />
            </>
          )}
          <button className="btn-link" type="button" onClick={() => setRestoring(!restoring)}>
            {restoring ? t('setup.createInstead') : t('setup.restoreLink')}
          </button>
        </div>
      </div>
    </main>
  );
}

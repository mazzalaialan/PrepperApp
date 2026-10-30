import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, X } from 'lucide-react';
import { CAPABILITIES, useCapabilities } from '@/core/capabilities/capabilities';
import { WrongSecretError } from '@/core/crypto/crypto';
import { setLanguage } from '@/core/i18n/i18n';
import { ServerError, checkServer, enableNotifications, normalizeServerUrl } from '@/core/notifications/notifications';
import { useVault } from '@/core/security/useVault';
import {
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  changePassword,
  unlockWithPassword,
} from '@/core/security/vault';
import { AUTO_LOCK_OPTIONS, LANGUAGES, THEMES, useSettings, type Settings } from '@/core/settings/settings';
import { Segmented } from '@/ui/Segmented';
import { NotificationsSection } from './NotificationsSection';

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const lock = useVault((s) => s.lock);

  return (
    <div className="stack">
      <h1 className="page-title">{t('settings.title')}</h1>

      <section className="card stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.general')}</h2>
        <Segmented
          label={t('settings.language')}
          value={settings.language}
          options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
          onChange={(language) => {
            setLanguage(language);
            void update({ language });
          }}
        />
        <Segmented
          label={t('settings.theme')}
          value={settings.theme}
          options={THEMES.map((th) => ({ value: th, label: t(`theme.${th}`) }))}
          onChange={(theme) => void update({ theme })}
        />
        <Segmented
          label={t('settings.units')}
          value={settings.units}
          options={(['metric', 'imperial'] as const).map((u) => ({ value: u, label: t(`units.${u}`) }))}
          onChange={(units) => void update({ units })}
        />
      </section>

      <section className="card stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.security')}</h2>
        <div className="field">
          <label htmlFor="autolock">{t('settings.autoLock')}</label>
          <select
            id="autolock"
            className="select"
            value={settings.autoLockMinutes}
            onChange={(e) => void update({ autoLockMinutes: Number(e.target.value) })}
          >
            {AUTO_LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('settings.minutes', { count: m })}
              </option>
            ))}
          </select>
        </div>
        <ChangePasswordForm />
        <button className="btn" type="button" onClick={lock}>
          <Lock size={18} /> {t('settings.lockNow')}
        </button>
      </section>

      <ConnectionsSection settings={settings} onSave={update} />
      <NotificationsSection />
      <DeviceSection />
      <StorageSection />

      <section className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.about')}</h2>
        <p style={{ margin: 0 }}>{t('app.name')}</p>
        <p className="hint">{t('settings.version', { version: __APP_VERSION__ })}</p>
        <p className="hint" style={{ fontStyle: 'italic' }}>{t('app.motto')}</p>
      </section>
    </div>
  );
}

function ChangePasswordForm() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      // Verifica la contraseña actual antes de reemplazarla.
      await unlockWithPassword(current);
      await changePassword(next);
      setCurrent('');
      setNext('');
      setMessage({ ok: true, text: t('settings.passwordChanged') });
    } catch (err) {
      if (err instanceof WrongSecretError) return setMessage({ ok: false, text: t('unlock.wrong') });
      if (err instanceof WeakPasswordError)
        return setMessage({ ok: false, text: t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }) });
      throw err;
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <h3 style={{ fontSize: '1rem' }}>{t('settings.changePassword')}</h3>
      <div className="field">
        <label htmlFor="current-password">{t('settings.currentPassword')}</label>
        <input
          id="current-password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="next-password">{t('settings.newPassword')}</label>
        <input
          id="next-password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      {message && <p className={message.ok ? 'success' : 'error'} role="status">{message.text}</p>}
      <button className="btn" type="submit" disabled={!current || !next}>
        {t('common.save')}
      </button>
    </form>
  );
}

function ConnectionsSection({ settings, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => Promise<void> }) {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [weatherUrl, setWeatherUrl] = useState(settings.weatherUrl);
  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextServer = serverUrl.trim() ? normalizeServerUrl(serverUrl) : '';
    const serverChanged = nextServer !== settings.serverUrl;
    await onSave({ serverUrl: nextServer, weatherUrl: weatherUrl.trim() });
    setServerUrl(nextServer);
    setSaved(true);
    // Con notificaciones activas, cambiar de servidor re-registra el dispositivo (o lo da de baja si se vació).
    if (serverChanged && settings.notificationsEnabled) await enableNotifications().catch(() => undefined);
  }

  async function testServer() {
    setCheck(null);
    try {
      const info = await checkServer(serverUrl);
      setCheck({ ok: true, text: t('settings.serverOk', { version: info.version }) });
    } catch (err) {
      if (!(err instanceof ServerError)) throw err;
      setCheck({ ok: false, text: t(`notifications.error.${err.code}`) });
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.connections')}</h2>
      <p className="hint">{t('settings.connectionsHint')}</p>
      <div className="field">
        <label htmlFor="server-url">{t('settings.serverUrl')}</label>
        <input
          id="server-url"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={serverUrl}
          onChange={(e) => {
            setServerUrl(e.target.value);
            setSaved(false);
          }}
        />
        <p className="hint">{t('settings.serverUrlHint')}</p>
        {serverUrl.trim() && (
          <button className="btn-link" type="button" onClick={() => void testServer()} style={{ alignSelf: 'flex-start' }}>
            {t('settings.serverTest')}
          </button>
        )}
        {check && <p className={check.ok ? 'success' : 'error'} role="status">{check.text}</p>}
      </div>
      <div className="field">
        <label htmlFor="weather-url">{t('settings.weatherUrl')}</label>
        <input
          id="weather-url"
          className="input"
          type="url"
          inputMode="url"
          value={weatherUrl}
          onChange={(e) => {
            setWeatherUrl(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      {saved && <p className="success" role="status">{t('common.saved')}</p>}
      <button className="btn" type="submit">
        {t('common.save')}
      </button>
    </form>
  );
}

function DeviceSection() {
  const { t } = useTranslation();
  const caps = useCapabilities((s) => s.caps);
  return (
    <section className="card stack">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.device')}</h2>
      <p className="hint">{t('settings.deviceHint')}</p>
      <ul className="cap-list">
        {CAPABILITIES.map((c) => {
          const ok = caps?.[c] ?? false;
          return (
            <li key={c} className={ok ? 'cap-yes' : 'cap-no'}>
              {ok ? <Check size={18} aria-label="✓" /> : <X size={18} aria-label="✗" />}
              <span style={{ color: 'var(--text)' }}>{t(`capabilities.${c}`)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[i]}`;
}

function StorageSection() {
  const { t, i18n } = useTranslation();
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.estimate().then(setEstimate);
    void navigator.storage?.persisted().then(setPersisted);
  }, []);

  if (!navigator.storage) return null;

  return (
    <section className="card stack">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.storage')}</h2>
      {estimate && (
        <p style={{ margin: 0 }}>
          {t('settings.storageUsed', {
            used: formatBytes(estimate.usage ?? 0, i18n.language),
            quota: formatBytes(estimate.quota ?? 0, i18n.language),
          })}
        </p>
      )}
      {persisted !== null && (
        <p className={persisted ? 'success' : 'hint'}>
          {t(persisted ? 'settings.storagePersistent' : 'settings.storageNotPersistent')}
        </p>
      )}
      {persisted === false && (
        <button className="btn" type="button" onClick={() => void navigator.storage.persist().then(setPersisted)}>
          {t('settings.storagePersist')}
        </button>
      )}
    </section>
  );
}

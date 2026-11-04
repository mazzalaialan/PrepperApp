import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, Send } from 'lucide-react';
import {
  ServerError,
  disableNotifications,
  enableNotifications,
  sendTestNotification,
  syncPushAlerts,
  type EnableResult,
} from '@/core/notifications/notifications';
import { readNotificationState, type NotificationState } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function NotificationsSection() {
  const { t } = useTranslation();
  const { notificationsEnabled, notifyHour, serverUrl } = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [state, setState] = useState<NotificationState | null>(null);
  const [result, setResult] = useState<EnableResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState<'server' | 'local' | null>(null);
  const supported = 'Notification' in window && 'serviceWorker' in navigator;
  const denied = supported && Notification.permission === 'denied';

  useEffect(() => {
    void readNotificationState().then(setState);
  }, [notificationsEnabled, result]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setTestSent(null);
    try {
      await action();
    } catch (err) {
      if (!(err instanceof ServerError)) throw err;
      setError(t(`notifications.error.${err.code}`));
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <section className="card stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('notifications.title')}</h2>
        <p className="hint">{t('notifications.unsupported')}</p>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('notifications.title')}</h2>
      <p className="hint">{t('notifications.intro')}</p>

      {notificationsEnabled ? (
        <>
          <ul className="status-list">
            <li>{state?.push ? t('notifications.pushOn', { server: state.push.serverUrl }) : serverUrl ? t('notifications.pushPending') : t('notifications.localOnly')}</li>
            {result && !result.localDaily && !result.push && <li>{t('notifications.inAppOnly')}</li>}
            {result?.pushError && <li className="error">{t(`notifications.error.${result.pushError.code}`)}</li>}
          </ul>
          <div className="field">
            <label htmlFor="notify-hour">{t('notifications.hour')}</label>
            <select
              id="notify-hour"
              className="select"
              value={notifyHour}
              onChange={(e) => void update({ notifyHour: Number(e.target.value) }).then(syncPushAlerts)}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <p className="hint">{t('notifications.hourHint')}</p>
          </div>
          <div className="row-end">
            <button className="btn btn-danger-outline" type="button" disabled={busy} onClick={() => void run(async () => { await disableNotifications(); setResult(null); })}>
              <BellOff size={18} /> {t('notifications.disable')}
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void run(async () => setTestSent(await sendTestNotification()))}>
              <Send size={18} /> {t('notifications.test')}
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" type="button" disabled={busy || denied} onClick={() => void run(async () => setResult(await enableNotifications()))}>
          <Bell size={18} /> {t('notifications.enable')}
        </button>
      )}
      {testSent && notificationsEnabled && (
        <p className="hint" role="status" data-testid="test-sent">
          {t(testSent === 'server' ? 'notifications.testSentServer' : 'notifications.testSentLocal')}
        </p>
      )}
      {denied && <p className="error">{t('notifications.error.permission-denied')}</p>}
      {error && !denied && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

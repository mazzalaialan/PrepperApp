import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BackupError, readBackup, restoreBackup, BACKUP_EXTENSION, type ParsedBackup, type SecretKind } from '@/core/backup/backup';
import { WrongSecretError } from '@/core/crypto/crypto';
import { setLanguage } from '@/core/i18n/i18n';
import { useSettings } from '@/core/settings/settings';
import { readFileBytes } from '@/ui/files';

interface Props {
  /** Hay datos en este dispositivo que se van a reemplazar. */
  replacesData: boolean;
  onDone?: () => void;
}

export function RestoreForm({ replacesData, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  const [kind, setKind] = useState<SecretKind>('password');
  const [secret, setSecret] = useState('');
  const [confirmed, setConfirmed] = useState(!replacesData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickFile(file: File | undefined) {
    setError(null);
    setBackup(null);
    if (!file) return;
    try {
      setBackup(readBackup(await readFileBytes(file)));
    } catch (err) {
      if (!(err instanceof BackupError)) throw err;
      setError(t(err.code === 'newer-version' ? 'backup.newerVersion' : 'backup.invalidFile'));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!backup) return;
    setBusy(true);
    setError(null);
    try {
      await restoreBackup(backup, secret, kind);
      await useSettings.getState().load();
      setLanguage(useSettings.getState().settings.language);
      onDone?.();
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setError(t(kind === 'password' ? 'backup.wrongPassword' : 'unlock.wrongRecovery'));
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="backup-file">{t('backup.file')}</label>
        <input
          id="backup-file"
          className="input file-input"
          type="file"
          accept={`${BACKUP_EXTENSION},application/zip,application/octet-stream`}
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
      </div>

      {backup && (
        <>
          <p className="hint">
            {t('backup.summary', {
              date: fmtDate(backup.manifest.createdAt),
              items: backup.manifest.counts.items ?? 0,
              locations: backup.manifest.counts.locations ?? 0,
            })}
          </p>
          <div className="field">
            <label htmlFor="backup-secret">{t(kind === 'password' ? 'backup.passwordAtExport' : 'unlock.recoveryKey')}</label>
            <input
              id="backup-secret"
              className="input"
              type={kind === 'password' ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <button
            className="btn-link"
            type="button"
            onClick={() => {
              setKind(kind === 'password' ? 'recovery' : 'password');
              setSecret('');
            }}
          >
            {t(kind === 'password' ? 'unlock.useRecovery' : 'unlock.usePassword')}
          </button>
          {replacesData && (
            <>
              <p className="warning-box">{t('backup.replaceWarning')}</p>
              <label className="check">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                {t('backup.replaceConfirm')}
              </label>
            </>
          )}
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {backup && (
        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !secret || !confirmed}>
          {busy ? t('backup.restoring') : t('backup.restore')}
        </button>
      )}
    </form>
  );
}

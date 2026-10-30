import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { backupFileName, exportBackup, lastBackupAt, markBackupDone } from '@/core/backup/backup';
import { deliverFile } from '@/ui/files';
import { daysBetween, today } from '@/modules/inventory/domain/dates';
import { RestoreForm } from './RestoreForm';

export function BackupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void lastBackupAt().then(setLast);
  }, []);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const bytes = await exportBackup(__APP_VERSION__);
      const how = await deliverFile(bytes, backupFileName());
      await markBackupDone();
      setLast(await lastBackupAt());
      setMessage(t(how === 'shared' ? 'backup.shared' : 'backup.downloaded'));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    } finally {
      setBusy(false);
    }
  }

  const daysAgo = last ? daysBetween(last.slice(0, 10), today()) : null;

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.backup.title')}</h1>

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('backup.exportTitle')}</h2>
        <p className="hint">{t('backup.exportHint')}</p>
        <p style={{ margin: 0 }}>
          {daysAgo === null
            ? t('backup.never')
            : daysAgo === 0
              ? t('backup.lastToday')
              : t('backup.lastDaysAgo', { count: daysAgo })}
        </p>
        {message && <p className="success" role="status">{message}</p>}
        <button className="btn btn-primary" type="button" onClick={handleExport} disabled={busy}>
          <Download size={20} /> {busy ? t('backup.exporting') : t('backup.export')}
        </button>
      </section>

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('backup.importTitle')}</h2>
        <p className="hint">{t('backup.importHint')}</p>
        <RestoreForm replacesData onDone={() => navigate('/', { replace: true })} />
      </section>
    </div>
  );
}

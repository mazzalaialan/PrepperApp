import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Send } from 'lucide-react';
import { backupFileName, exportBackup, lastBackupAt, markBackupDone } from '@/core/backup/backup';
import { TransferError, formatTransferCode, transferLink, uploadTransfer, type TransferTicket } from '@/core/backup/transfer';
import { useSettings } from '@/core/settings/settings';
import { deliverFile } from '@/ui/files';
import { QrCode } from '@/ui/QrCode';
import { daysBetween, today } from '@/modules/inventory/domain/dates';
import { RestoreForm } from './RestoreForm';

export function BackupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Llegada por link o QR de transferencia (#/transfer?server=…&code=…).
  const server = params.get('server');
  const code = params.get('code');
  const initialTransfer = useMemo(() => (server && code ? { server, code } : null), [server, code]);

  useEffect(() => {
    void lastBackupAt().then(setLast);
  }, []);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const how = await deliverFile(await exportBackup(__APP_VERSION__), backupFileName());
      await markBackupDone();
      setLast(await lastBackupAt());
      setMessage(t(how === 'shared' ? 'backup.shared' : 'backup.downloaded'));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    } finally {
      setBusy(false);
    }
  }

  const daysAgo = last ? daysBetween(today(new Date(last)), today()) : null;

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/settings" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.backup.title')}</h1>
      </div>

      {!initialTransfer && (
        <>
          <section className="card stack">
            <h2 className="section-title" style={{ margin: 0 }}>{t('backup.exportTitle')}</h2>
            <p className="hint">{t('backup.exportHint')}</p>
            <p style={{ margin: 0 }}>
              {daysAgo === null ? t('backup.never') : daysAgo === 0 ? t('backup.lastToday') : t('backup.lastDaysAgo', { count: daysAgo })}
            </p>
            {message && <p className="success" role="status">{message}</p>}
            <button className="btn btn-primary" type="button" onClick={handleExport} disabled={busy}>
              <Download size={20} /> {busy ? t('backup.exporting') : t('backup.export')}
            </button>
          </section>

          <SendSection onSent={() => void markBackupDone().then(lastBackupAt).then(setLast)} />
        </>
      )}

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{initialTransfer ? t('transfer.receiveTitle') : t('backup.importTitle')}</h2>
        <p className="hint">{t('backup.importHint')}</p>
        <RestoreForm replacesData initialTransfer={initialTransfer} onDone={() => navigate('/', { replace: true })} />
      </section>
    </div>
  );
}

/** Enviar a otro dispositivo por el servidor propio: código + QR. */
function SendSection({ onSent }: { onSent: () => void }) {
  const { t, i18n } = useTranslation();
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const [ticket, setTicket] = useState<TransferTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setTicket(await uploadTransfer(serverUrl, await exportBackup(__APP_VERSION__)));
      onSent();
    } catch (err) {
      if (!(err instanceof TransferError)) throw err;
      setError(t(`transfer.error.${err.code}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2 className="section-title" style={{ margin: 0 }}>{t('transfer.sendTitle')}</h2>
      {!serverUrl ? (
        <p className="hint">
          {t('transfer.needServer')} <Link to="/settings">{t('nav.settings')}</Link>
        </p>
      ) : ticket ? (
        <div className="transfer-ticket">
          <QrCode text={transferLink(serverUrl, ticket.code)} label={t('transfer.qrLabel')} />
          <p className="transfer-code" aria-label={t('transfer.code')}>{formatTransferCode(ticket.code)}</p>
          <p className="hint">
            {t('transfer.instructions', {
              expires: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.expiresAt)),
            })}
          </p>
        </div>
      ) : (
        <>
          <p className="hint">{t('transfer.sendHint')}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" type="button" onClick={() => void send()} disabled={busy}>
            <Send size={18} /> {busy ? t('transfer.sending') : t('transfer.send')}
          </button>
        </>
      )}
    </section>
  );
}

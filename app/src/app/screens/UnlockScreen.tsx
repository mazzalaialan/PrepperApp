import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { WrongSecretError } from '@/core/crypto/crypto';
import { useVault } from '@/core/security/useVault';
import { BrandHeader } from '@/ui/Brand';

type Mode = 'password' | 'recovery';

export function UnlockScreen() {
  const { t } = useTranslation();
  const unlock = useVault((s) => s.unlock);
  const recover = useVault((s) => s.recover);
  const [mode, setMode] = useState<Mode>('password');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setSecret('');
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'password' ? unlock(secret) : recover(secret));
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setError(t(mode === 'password' ? 'unlock.wrong' : 'unlock.wrongRecovery'));
      setBusy(false);
    }
  }

  const isPassword = mode === 'password';

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        <form className="card stack" onSubmit={handleSubmit}>
          <h2>{t(isPassword ? 'unlock.title' : 'unlock.recoveryTitle')}</h2>
          <div className="field">
            <label htmlFor="secret">{t(isPassword ? 'unlock.password' : 'unlock.recoveryKey')}</label>
            <input
              id="secret"
              className="input"
              type={isPassword ? 'password' : 'text'}
              autoComplete={isPassword ? 'current-password' : 'off'}
              autoCapitalize={isPassword ? undefined : 'characters'}
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !secret}>
            {busy ? t('unlock.unlocking') : t('unlock.submit')}
          </button>
          <button className="btn-link" type="button" onClick={() => switchMode(isPassword ? 'recovery' : 'password')}>
            {t(isPassword ? 'unlock.useRecovery' : 'unlock.usePassword')}
          </button>
        </form>
      </div>
    </main>
  );
}

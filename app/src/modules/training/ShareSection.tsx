import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Link2, Share2, Trash2 } from 'lucide-react';
import type { Outing } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { CopyButton } from '@/modules/emergency/parts';
import { useTracks } from '@/modules/tracks/store';
import { buildSharePayload, DEFAULT_TRIM_M, shareOuting, ShareError, unshareOuting } from './share';
import { useTraining } from './store';

/**
 * Compartir la salida con un enlace público (para redes sociales). Solo si se
 * elige, y se puede dejar de compartir cuando se quiera. Sin fotos.
 */
export function ShareSection({ outing }: { outing: Outing }) {
  const { t, i18n } = useTranslation();
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const workouts = useTraining((s) => s.workouts);
  const saveOuting = useTraining((s) => s.saveOuting);
  const tracks = useTracks((s) => s.tracks);
  const [trim, setTrim] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const share = outing.share;
  const hasActivities = [...workouts.values()].some((w) => w.outingId === outing.id);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(t(`outings.share.error.${err instanceof ShareError ? err.code : 'failed'}`));
    } finally {
      setBusy(false);
    }
  }
  const create = () =>
    run(async () => {
      const payload = buildSharePayload(outing, [...workouts.values()], tracks, i18n.language.startsWith('en') ? 'en' : 'es', trim ? DEFAULT_TRIM_M : 0);
      const created = await shareOuting(serverUrl, payload);
      await saveOuting({ ...outing, share: created });
    });
  const remove = () =>
    run(async () => {
      if (share) await unshareOuting(serverUrl, share);
      const { share: _gone, ...rest } = outing;
      await saveOuting(rest);
    });

  return (
    <section className="card stack" aria-labelledby="o-share" data-testid="o-share">
      <h2 id="o-share" className="section-title" style={{ margin: 0 }}>
        {t('outings.share.title')}
      </h2>
      {share ? (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('outings.share.active')}</p>
          <div className="input-group">
            <input className="input" readOnly value={share.url} aria-label={t('outings.share.link')} data-testid="o-share-url" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={share.url} label={t('outings.share.copy')} />
            {'share' in navigator && (
              <button className="btn" type="button" onClick={() => void navigator.share({ title: outing.name, url: share.url }).catch(() => undefined)} aria-label={t('outings.share.send')} title={t('outings.share.send')}>
                <Share2 size={20} />
              </button>
            )}
          </div>
          <p className="hint" style={{ margin: 0 }}>{t('outings.share.expires', { date: new Date(share.expiresAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }) })}</p>
          <div className="row-end wrap">
            <button className="btn" type="button" disabled={busy} onClick={() => void run(async () => { await unshareOuting(serverUrl, share); const created = await shareOuting(serverUrl, buildSharePayload(outing, [...workouts.values()], tracks, i18n.language.startsWith('en') ? 'en' : 'es', trim ? DEFAULT_TRIM_M : 0)); await saveOuting({ ...outing, share: created }); })}>
              {t('outings.share.update')}
            </button>
            <button className="btn btn-danger-outline" type="button" disabled={busy} onClick={() => void remove()} data-testid="o-unshare">
              <Trash2 size={18} /> {t('outings.share.stop')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('outings.share.intro')}</p>
          <p className="hint" style={{ margin: 0 }}>{t('outings.share.privacy')}</p>
          <label className="check">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
            {t('outings.share.trim', { meters: DEFAULT_TRIM_M })}
          </label>
          {!serverUrl ? (
            <p className="hint" style={{ margin: 0 }}>
              {t('outings.share.noServer')} <Link to="/settings">{t('settings.title')}</Link>
            </p>
          ) : (
            <div className="row-end">
              <button className="btn btn-primary" type="button" disabled={busy || !hasActivities} onClick={() => void create()} data-testid="o-share-create">
                <Link2 size={18} /> {t('outings.share.create')}
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen, CircleCheck, Download, Lock, RefreshCw, Search, Trash2, Unlock } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { Dialog } from '@/ui/Dialog';
import type { LibraryBook } from './books';
import { useLibrary } from './store';

const mb = (bytes: number, lang: string) => new Intl.NumberFormat(lang, { maximumFractionDigits: bytes < 10 * 2 ** 20 ? 1 : 0 }).format(bytes / 2 ** 20);

type Filter = 'all' | 'public' | 'private' | 'installed';

/** Pide la clave VikArg para los libros con derechos. */
function KeyDialog({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const { t } = useTranslation();
  const unlockPrivate = useLibrary((s) => s.unlockPrivate);
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await unlockPrivate(pass, remember);
    setBusy(false);
    if (ok) onOk();
    else setError(true);
  }

  return (
    <Dialog
      title={t('library.keyTitle')}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" type="submit" form="library-key" disabled={!pass || busy} data-testid="library-key-ok">
          <Unlock size={18} /> {busy ? t('library.keyChecking') : t('library.keyOk')}
        </button>
      }
    >
      <form id="library-key" className="stack" onSubmit={submit}>
        <p className="warning-box" style={{ margin: 0 }}>{t('library.personalUse')}</p>
        <div className="field">
          <label htmlFor="library-pass">{t('library.key')}</label>
          <input id="library-pass" className="input" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <p className="error">{t('library.keyBad')}</p>}
        </div>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('library.keyRemember')}
        </label>
      </form>
    </Dialog>
  );
}

function LicenseBadge({ book }: { book: LibraryBook }) {
  const { t } = useTranslation();
  return book.license === 'public' ? (
    <span className="pill pill-free" title={book.licenseReason}>
      {t('library.free')}
    </span>
  ) : (
    <span className="pill pill-rights" title={t('library.rightsHint')}>
      <Lock size={12} aria-hidden /> {t('library.rights')}
    </span>
  );
}

/** Biblioteca: libros del servidor propio por categoría; libres (verde) y con derechos (con la clave VikArg). */
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const { catalog, offline, loading, installed, selected, key, progress, failures, refresh, toggle, setSelected, download, remove, forgetKey, passphrase } = useLibrary(
    useShallow((s) => ({
      catalog: s.catalog,
      offline: s.offline,
      loading: s.loading,
      installed: s.installed,
      selected: s.selected,
      key: s.key,
      progress: s.progress,
      failures: s.failures,
      refresh: s.refresh,
      toggle: s.toggle,
      setSelected: s.setSelected,
      download: s.download,
      remove: s.remove,
      forgetKey: s.forgetKey,
      passphrase: s.passphrase,
    })),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [askKey, setAskKey] = useState(false);

  useEffect(() => {
    void refresh(serverUrl);
  }, [serverUrl]);

  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const visible = useMemo(() => {
    const q = norm(query.trim());
    return (catalog?.categories ?? [])
      .map((c) => ({
        ...c,
        books: c.books.filter((b) => {
          if (filter === 'public' && b.license !== 'public') return false;
          if (filter === 'private' && b.license === 'public') return false;
          if (filter === 'installed' && !installed.has(b.id)) return false;
          return !q || norm(`${b.title} ${b.author} ${b.section ?? ''}`).includes(q);
        }),
      }))
      .filter((c) => c.books.length > 0);
  }, [catalog, query, filter, installed]);

  const all = useMemo(() => new Map((catalog?.categories ?? []).flatMap((c) => c.books.map((b) => [b.id, b]))), [catalog]);
  const chosen = [...selected].map((id) => all.get(id)).filter((b): b is LibraryBook => !!b);
  const chosenBytes = chosen.reduce((s, b) => s + b.bytes, 0);
  const needsKey = chosen.some((b) => b.license !== 'public') && !key;
  const canPrivate = !!catalog?.privateAvailable;
  const upToDate = (b: LibraryBook) => installed.get(b.id)?.sha256 === b.sha256;
  const selectable = (b: LibraryBook) => !upToDate(b) && (b.license === 'public' || canPrivate);

  function start() {
    if (needsKey) setAskKey(true);
    else void download(serverUrl);
  }

  if (!serverUrl) {
    return (
      <div className="stack">
        <h1 className="page-title">{t('modules.libraryBooks.title')}</h1>
        <p className="hint">{t('library.noServer')}</p>
      </div>
    );
  }

  return (
    <div className="stack library">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1, margin: 0 }}>{t('modules.libraryBooks.title')}</h1>
        <button className="icon-btn" type="button" onClick={() => void refresh(serverUrl)} disabled={loading} aria-label={t('library.refresh')}>
          <RefreshCw size={20} />
        </button>
      </div>
      {offline && catalog && <p className="hint" style={{ margin: 0 }}>{t('library.offline', { date: new Date(catalog.generatedAt).toLocaleDateString(lang) })}</p>}
      {!catalog && !loading && <p className="hint">{t('library.noLibrary')}</p>}
      {catalog && (
        <>
          <p className="hint library-legend" style={{ margin: 0 }}>
            <span className="pill pill-free">{t('library.free')}</span> {t('library.freeHint')} <span className="pill pill-rights">
              <Lock size={12} aria-hidden /> {t('library.rights')}
            </span>{' '}
            {canPrivate ? t('library.rightsHint') : t('library.rightsUnavailable')}
          </p>
          {key && (
            <p className="hint" style={{ margin: 0 }}>
              <Unlock size={14} aria-hidden /> {t('library.keyActive')}{' '}
              {passphrase && (
                <button className="btn-link" type="button" onClick={() => void forgetKey()}>
                  {t('library.keyForget')}
                </button>
              )}
            </p>
          )}
          <div className="input-group">
            <Search size={18} aria-hidden style={{ alignSelf: 'center' }} />
            <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.search')} aria-label={t('library.search')} />
          </div>
          <div className="chips" role="group" aria-label={t('library.filter')}>
            {(['all', 'public', 'private', 'installed'] as const).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`library.filters.${f}`)}
              </button>
            ))}
          </div>

          {visible.map((cat) => {
            const ids = cat.books.filter(selectable).map((b) => b.id);
            const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
            const some = ids.some((id) => selected.has(id));
            const have = cat.books.filter((b) => installed.has(b.id)).length;
            return (
              <details key={cat.id} className="card library-cat" data-testid={`library-cat-${cat.id}`} open={visible.length === 1 || !!query}>
                <summary>
                  <span className="list-title">{cat.name}</span>
                  <span className="hint">{t('library.catCount', { count: cat.books.length, have })}</span>
                </summary>
                {ids.length > 0 && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = some && !allOn;
                      }}
                      onChange={() => setSelected(ids, !allOn)}
                      aria-label={t('library.selectCategory', { name: cat.name })}
                    />
                    {t('library.selectAll')}
                  </label>
                )}
                <ul className="list">
                  {cat.books.map((b) => {
                    const inst = installed.get(b.id);
                    const fail = failures.get(b.id);
                    return (
                      <li key={b.id} className={`list-row library-book ${b.license === 'public' ? 'is-free' : 'is-rights'}`} data-testid={`book-${b.id}`}>
                        <input
                          type="checkbox"
                          checked={selected.has(b.id)}
                          disabled={!selectable(b)}
                          onChange={() => toggle(b.id)}
                          aria-label={t('library.selectBook', { title: b.title })}
                        />
                        <span className="list-main">
                          <span className="list-title">{b.title}</span>
                          <span className="list-sub">
                            {[b.author, b.section, `${mb(b.bytes, lang)} MB`].filter(Boolean).join(' · ')}
                            {inst && !upToDate(b) && ` · ${t('library.updateAvailable')}`}
                            {fail && <span className="error"> · {t(`library.errors.${fail}`)}</span>}
                          </span>
                        </span>
                        <LicenseBadge book={b} />
                        {inst && (
                          <>
                            <Link className="icon-btn" to={`/library/read/${b.id}`} aria-label={t('library.read', { title: b.title })}>
                              <BookOpen size={20} />
                            </Link>
                            <button
                              className="icon-btn"
                              type="button"
                              onClick={() => window.confirm(t('library.confirmRemove', { title: b.title })) && void remove(b.id)}
                              aria-label={t('library.remove', { title: b.title })}
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                        {inst && upToDate(b) && <CircleCheck size={18} style={{ color: 'var(--ok)', flexShrink: 0 }} aria-label={t('library.installed')} />}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </>
      )}

      {(chosen.length > 0 || progress) && (
        <div className="library-bar" data-testid="library-bar">
          {progress ? (
            <div style={{ flex: 1 }} role="status" aria-live="polite">
              <span className="hint">{t('library.downloading', { n: progress.n, total: progress.total, title: progress.title })}</span>
              <span className="progress">
                <span className="progress-bar" style={{ width: `${(100 * progress.bytes) / Math.max(1, progress.bookBytes)}%` }} />
              </span>
            </div>
          ) : (
            <>
              <span style={{ flex: 1 }}>{t('library.selected', { count: chosen.length, mb: mb(chosenBytes, lang) })}</span>
              <button className="btn" type="button" onClick={() => setSelected([...selected], false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" type="button" onClick={start} data-testid="library-download">
                {needsKey ? <Lock size={18} /> : <Download size={18} />} {t('library.download')}
              </button>
            </>
          )}
        </div>
      )}
      {askKey && (
        <KeyDialog
          onClose={() => setAskKey(false)}
          onOk={() => {
            setAskKey(false);
            void download(serverUrl);
          }}
        />
      )}
    </div>
  );
}

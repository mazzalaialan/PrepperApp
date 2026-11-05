import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { bookText } from './books';
import { useLibrary } from './store';

interface Hit {
  bookId: string;
  title: string;
  file: string;
  chapter: string;
  snippet: string;
}

const MAX_HITS_PER_BOOK = 5;
const MAX_HITS = 100;

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Buscar en el texto de los libros bajados (sin conexión). */
export function LibrarySearchPage() {
  const { t } = useTranslation();
  const installed = useLibrary((s) => s.installed);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: FormEvent) {
    e.preventDefault();
    const q = fold(query.trim());
    if (q.length < 3) return;
    setBusy(true);
    const out: Hit[] = [];
    for (const b of installed.values()) {
      let n = 0;
      for (const part of await bookText(b.id)) {
        const folded = fold(part.text);
        let at = folded.indexOf(q);
        while (at >= 0 && n < MAX_HITS_PER_BOOK) {
          const from = Math.max(0, at - 80);
          out.push({
            bookId: b.id,
            title: b.title,
            file: part.file,
            chapter: b.chapters.find((c) => c.file === part.file)?.title ?? '',
            snippet: `${from > 0 ? '…' : ''}${part.text.slice(from, at + q.length + 120)}…`,
          });
          n++;
          at = folded.indexOf(q, at + q.length);
        }
        if (n >= MAX_HITS_PER_BOOK) break;
      }
      if (out.length >= MAX_HITS) break;
    }
    setHits(out);
    setBusy(false);
  }

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.librarySearch.title')}</h1>
      {installed.size === 0 ? (
        <p className="hint">{t('library.searchEmpty')}</p>
      ) : (
        <form className="input-group" onSubmit={run}>
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.searchText')} aria-label={t('library.searchText')} />
          <button className="btn btn-primary" type="submit" disabled={busy || query.trim().length < 3}>
            <Search size={18} /> {t('library.searchGo')}
          </button>
        </form>
      )}
      {hits && (
        <p className="hint" style={{ margin: 0 }}>
          {t('library.hits', { count: hits.length, books: installed.size })}
        </p>
      )}
      {hits && hits.length > 0 && (
        <ul className="list" data-testid="library-hits">
          {hits.map((h, i) => (
            <li key={i}>
              <Link className="list-row" to={`/library/read/${h.bookId}?cap=${encodeURIComponent(h.file)}`}>
                <span className="list-main">
                  <span className="list-title">
                    {h.title}
                    {h.chapter && h.chapter !== h.title ? ` · ${h.chapter}` : ''}
                  </span>
                  <span className="list-sub">{h.snippet}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

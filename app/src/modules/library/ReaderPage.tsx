import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { bookUrl } from './books';
import { useLibrary } from './store';

/**
 * Estilo del libro: el de la app (colores del tema, tamaño de letra). El
 * libro no trae estilos propios (ARQUITECTURA §11.2); el iframe es del mismo
 * origen pero sin scripts (sandbox), así que la app le agrega la hoja.
 */
function readerCss(fontPct: number): string {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return `
    :root { color-scheme: ${v('--bg', '#fff').startsWith('#f') ? 'light' : 'dark'}; }
    body { margin: 0 auto; padding: 12px 16px 48px; max-width: 46rem; font: ${fontPct}%/1.55 system-ui, sans-serif;
      background: ${v('--bg', '#fff')}; color: ${v('--text', '#111')}; overflow-wrap: anywhere; }
    h1, h2, h3 { line-height: 1.25; color: ${v('--text', '#111')}; }
    a { color: ${v('--accent', '#06c')}; }
    img { max-width: 100%; height: auto; background: #fff; border-radius: 6px; }
    figure { margin: 12px 0; }
    table { border-collapse: collapse; display: block; overflow-x: auto; }
    td, th { border: 1px solid ${v('--border', '#ccc')}; padding: 4px 6px; }
    nav { display: none; }
    pre { white-space: pre-wrap; }
    .reader-hit { background: ${v('--warn', '#d0a03c')}33; outline: 2px solid ${v('--warn', '#d0a03c')}; border-radius: 4px; }
  `;
}

/** Visor de un libro bajado, sin conexión. */
export function ReaderPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const book = useLibrary((s) => s.installed.get(id));
  const ready = useLibrary((s) => s.ready);
  const fontPct = useSettings((s) => s.settings.readerFontPct);
  const update = useSettings((s) => s.update);
  const frame = useRef<HTMLIFrameElement>(null);
  const chapters = book?.chapters ?? [];
  const file = params.get('cap') ?? chapters[0]?.file ?? 'index.html';
  const idx = Math.max(0, chapters.findIndex((c) => c.file === file));

  function style() {
    const doc = frame.current?.contentDocument;
    if (!doc?.head) return;
    doc.getElementById('vikarg-reader')?.remove();
    const el = doc.createElement('style');
    el.id = 'vikarg-reader';
    el.textContent = readerCss(fontPct);
    doc.head.appendChild(el);
    // Desde una referencia (ej.: la ficha de un nudo): se resalta y se muestra lo buscado.
    const q = params.get('q');
    if (q) {
      const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const target = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, figcaption, td')].find((n) => fold(n.textContent ?? '').includes(fold(q)));
      if (target && !target.classList.contains('reader-hit')) {
        target.classList.add('reader-hit');
        target.scrollIntoView({ block: 'center' });
      }
    }
    // Los enlaces del índice del libro abren el capítulo en el visor (y quedan en el historial de la app).
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href')!;
      if (/^cap-\d+\.html|^index\.html/.test(href)) {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          setParams({ cap: href.split('#')[0]! });
        });
      }
    });
  }
  useEffect(style, [fontPct]);

  if (!ready) return null;
  if (!book) return <Navigate to="/library/books" replace />;
  const go = (n: number) => setParams({ cap: chapters[n]!.file });

  return (
    <div className="reader" data-testid="reader">
      <div className="reader-bar">
        {chapters.length > 1 ? (
          <select className="select" value={file} onChange={(e) => setParams({ cap: e.target.value })} aria-label={t('library.chapter')}>
            {chapters.map((c) => (
              <option key={c.file} value={c.file}>
                {c.title}
              </option>
            ))}
          </select>
        ) : (
          <strong className="reader-title">{book.title}</strong>
        )}
        <button className="icon-btn" type="button" onClick={() => void update({ readerFontPct: Math.max(70, fontPct - 10) })} aria-label={t('library.smaller')}>
          <AArrowDown size={20} />
        </button>
        <button className="icon-btn" type="button" onClick={() => void update({ readerFontPct: Math.min(200, fontPct + 10) })} aria-label={t('library.bigger')}>
          <AArrowUp size={20} />
        </button>
      </div>
      <iframe
        ref={frame}
        key={file}
        className="reader-frame"
        title={book.title}
        src={bookUrl(book.id, file)}
        // Sin scripts: solo lectura. "allow-same-origin" deja que lo sirva el service worker y aplicar el estilo.
        sandbox="allow-same-origin"
        onLoad={style}
        data-testid="reader-frame"
      />
      {chapters.length > 1 && (
        <div className="reader-nav">
          <button className="btn" type="button" disabled={idx === 0} onClick={() => go(idx - 1)}>
            <ChevronLeft size={18} /> {t('knots.prev')}
          </button>
          <span className="hint">{t('library.chapterOf', { n: idx + 1, total: chapters.length })}</span>
          <button className="btn" type="button" disabled={idx >= chapters.length - 1} onClick={() => go(idx + 1)}>
            {t('knots.next')} <ChevronRight size={18} />
          </button>
        </div>
      )}
      <button className="btn-link" type="button" onClick={() => navigate('/library/books')} style={{ alignSelf: 'flex-start' }}>
        {t('library.allBooks')}
      </button>
    </div>
  );
}

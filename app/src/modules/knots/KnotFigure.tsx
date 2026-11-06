import { useEffect, useState } from 'react';

const BASE = `${import.meta.env.BASE_URL}knots/`;
const cache = new Map<string, Promise<string>>();

/** Texto del SVG (una vez por archivo; sin conexión lo sirve el service worker). */
function svgText(file: string): Promise<string> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(BASE + file).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}

/**
 * Figura de un nudo. Los diagramas propios (SVG) van dentro de la página para
 * tomar los colores del tema (fondo oscuro en el tema oscuro, variables --kd-*);
 * las fotos y figuras de manuales, como imagen.
 */
export function KnotFigure({ file, alt, className, testId }: { file: string; alt: string; className?: string; testId?: string }) {
  const svg = file.endsWith('.svg');
  const [markup, setMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!svg) return;
    let live = true;
    setMarkup(null);
    setFailed(false);
    svgText(file).then(
      (s) => live && setMarkup(s),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [file, svg]);

  if (!svg || failed) return <img className={className} src={BASE + file} alt={alt} loading="lazy" data-testid={testId} />;
  return <span className={`knot-figure ${className ?? ''}`} role="img" aria-label={alt} data-src={file} data-testid={testId} dangerouslySetInnerHTML={{ __html: markup ?? '' }} />;
}

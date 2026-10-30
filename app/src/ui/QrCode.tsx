import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * QR como SVG propio (un solo <path>), sin innerHTML. Siempre negro sobre
 * blanco, aun en tema oscuro o rojo: es lo que leen bien todas las cámaras.
 * Corrección de errores M: tolera manchas y reflejos en la pantalla.
 */
export function QrCode({ text, label, size = 220 }: { text: string; label: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, count: n };
  }, [text]);

  const margin = 2;
  const view = count + margin * 2;
  return (
    <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={`${-margin} ${-margin} ${view} ${view}`} shapeRendering="crispEdges">
      <rect x={-margin} y={-margin} width={view} height={view} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

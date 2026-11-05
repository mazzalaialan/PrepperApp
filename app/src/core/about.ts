/**
 * Datos de "Acerca de": a dónde llegan los reportes y mensajes. Hasta que haya un
 * mail propio o el servidor, se reporta en GitHub o se copia el mensaje.
 */

export const REPO_URL = 'https://github.com/mazzalaialan/PrepperApp';
export const CAFECITO_URL = 'https://cafecito.app/vikarg';
/** Mail de contacto de VikArg (formulario de contacto y reporte de errores). Vacío = el botón no aparece. */
export const CONTACT_EMAIL = 'contacto.vikarg@gmail.com';

export type FeedbackKind = 'bug' | 'idea' | 'message';

/** Versión y dispositivo, para entender un problema (nada personal). */
export function deviceInfo(version: string, language: string): string {
  const nav = globalThis.navigator;
  const screen = globalThis.screen;
  return [
    `VikArg ${version}`,
    nav ? `Navegador: ${nav.userAgent}` : '',
    screen ? `Pantalla: ${screen.width}×${screen.height}` : '',
    `Idioma: ${language}`,
    `Instalada: ${globalThis.matchMedia?.('(display-mode: standalone)').matches ? 'sí' : 'no'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function feedbackText(kindLabel: string, message: string, info: string | null): string {
  return [`[${kindLabel}]`, '', message.trim(), ...(info ? ['', '---', info] : [])].join('\n');
}

const LABELS: Record<FeedbackKind, string> = { bug: 'bug', idea: 'enhancement', message: 'question' };

/** Nuevo issue en GitHub con el texto armado (hace falta cuenta). */
export function githubIssueUrl(kind: FeedbackKind, title: string, body: string): string {
  const params = new URLSearchParams({ title, body, labels: LABELS[kind] });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

export function mailtoUrl(subject: string, body: string): string | null {
  if (!CONTACT_EMAIL) return null;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

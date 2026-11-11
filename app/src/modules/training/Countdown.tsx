import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { beep, buzz, say } from './cues';
import { useSettings } from '@/core/settings/settings';

/**
 * Cuenta regresiva antes de empezar (3, 5 o 10 s): números grandes en pantalla,
 * un pitido por segundo y uno más largo al arrancar. Se puede cancelar.
 */
export function Countdown({ seconds, onDone, onCancel }: { seconds: number; onDone: () => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation();
  const voice = useSettings((s) => s.settings.trainingVoice);
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // El foco pasa al botón Cancelar al abrirse (teclado y lectores de pantalla) y Escape cancela.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  done.current = onDone;
  useEffect(() => {
    if (left <= 0) {
      beep(988, 400);
      buzz([200, 100, 200]);
      if (voice) say(t('countdown.go'), i18n.language);
      done.current();
      return;
    }
    beep(660, 120);
    if (voice && left <= 3) say(String(left), i18n.language);
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="countdown" role="dialog" aria-modal="true" aria-label={t('countdown.title')} data-testid="countdown">
      {/* Los lectores de pantalla oyen solo el título (y la voz de la app cuenta los últimos segundos): no cada número. */}
      <p className="countdown-label" role="status">{t('countdown.title')}</p>
      <p className="countdown-number" aria-hidden data-testid="countdown-number">{Math.max(0, left)}</p>
      <button ref={cancelRef} className="btn" type="button" onClick={onCancel} data-testid="countdown-cancel">
        {t('common.cancel')}
      </button>
    </div>
  );
}

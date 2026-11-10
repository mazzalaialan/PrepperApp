import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { Dialog } from './Dialog';

/**
 * Confirmación propia en lugar de `window.confirm`: respeta el tema (oscuro, rojo
 * nocturno, ahorro), se maneja con teclado y lector de pantalla y se ve igual en
 * todas las pantallas. `await confirmAction(texto)` devuelve si se confirmó.
 * Hay que tener montado <ConfirmHost /> una vez (lo hace la estructura de la app).
 */

interface Pending {
  message: string;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Si ya había una sin contestar, se la da por cancelada.
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({ pending: { message, resolve } });
  });
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const pending = useConfirmStore((s) => s.pending);
  if (!pending) return null;
  const answer = (ok: boolean) => {
    useConfirmStore.setState({ pending: null });
    pending.resolve(ok);
  };
  return (
    <Dialog
      title={t('common.confirmTitle')}
      onClose={() => answer(false)}
      footer={
        <>
          <button className="btn" type="button" onClick={() => answer(false)} data-testid="confirm-cancel">
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger-outline" type="button" onClick={() => answer(true)} data-testid="confirm-ok" autoFocus>
            {t('common.confirm')}
          </button>
        </>
      }
    >
      <p data-testid="confirm-message" style={{ margin: 0 }}>{pending.message}</p>
    </Dialog>
  );
}

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinned } from 'lucide-react';
import type { LatLon } from '@/core/geo/geo';

const MapPointDialog = lazy(() => import('./MapPointDialog').then((m) => ({ default: m.MapPointDialog })));

/** Botón "Elegir en el mapa": abre el mapa, se toca un punto y vuelven sus coordenadas. */
export function MapPickButton({ initial, onPick, label = false }: { initial: LatLon | null; onPick: (p: LatLon) => void; label?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" type="button" onClick={() => setOpen(true)} aria-label={t('mapPick.open')} title={t('mapPick.open')}>
        <MapPinned size={20} aria-hidden />
        {label && ` ${t('mapPick.open')}`}
      </button>
      {open && (
        <Suspense fallback={null}>
          <MapPointDialog
            initial={initial}
            onClose={() => setOpen(false)}
            onPick={(p) => {
              setOpen(false);
              onPick(p);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

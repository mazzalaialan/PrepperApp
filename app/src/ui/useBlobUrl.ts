import { useEffect, useState } from 'react';
import { blobStore } from '@/core/db/repository';

/** Descifra un binario guardado y lo expone como URL temporal; la libera al desmontar o cambiar. */
export function useBlobUrl(id: string | undefined, mime: string | undefined): string | null {
  // Se guarda junto con su id: al cambiar de id nunca se devuelve la imagen anterior,
  // ni siquiera en el render previo a que corra el efecto.
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void blobStore.get(id).then((bytes) => {
      if (cancelled || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setLoaded({ id, url: objectUrl });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, mime]);

  return loaded && loaded.id === id ? loaded.url : null;
}

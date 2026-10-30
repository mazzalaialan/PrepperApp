import { useEffect, useState } from 'react';
import { blobStore } from '@/core/db/repository';

/** Descifra un binario guardado y lo expone como URL temporal; la libera al desmontar o cambiar. */
export function useBlobUrl(id: string | undefined, mime: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void blobStore.get(id).then((bytes) => {
      if (cancelled || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, mime]);

  return url;
}

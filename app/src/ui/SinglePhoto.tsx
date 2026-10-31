import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, ImageOff, Trash2 } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { compressImage, type CompressedImage } from '@/core/images/compress';
import type { Attachment } from '@/core/model/types';
import { useBlobUrl } from './useBlobUrl';

interface Props {
  photo: Attachment | undefined;
  alt: string;
  onSet: (image: CompressedImage) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Para el input de archivo en las pruebas. */
  testId?: string;
}

/** Una foto (artículo, persona): sacar con la cámara, elegir de archivo o quitar. */
export function SinglePhoto({ photo, alt, onSet, onRemove, testId = 'photo-file' }: Props) {
  const { t } = useTranslation();
  const hasCamera = useCapabilities((s) => s.caps?.camera ?? false);
  const url = useBlobUrl(photo?.id, photo?.mime);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onSet(await compressImage(file));
    } catch {
      setError(t('photo.invalid'));
    } finally {
      setBusy(false);
    }
  }

  const inputProps = {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      void handleFile(e.target.files?.[0]);
      e.target.value = ''; // permite volver a elegir el mismo archivo
    },
  } as const;

  return (
    <section className="card stack">
      <h2 className="section-title" style={{ margin: 0 }}>{t('photo.title')}</h2>
      {url && photo ? (
        <img className="item-photo" src={url} alt={alt} width={photo.width} height={photo.height} />
      ) : (
        <div className="item-photo-empty">
          <ImageOff size={32} aria-hidden />
          <span>{busy ? t('photo.processing') : t('photo.none')}</span>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-end">
        {photo && (
          <button className="btn btn-danger-outline" type="button" onClick={() => void onRemove()} disabled={busy}>
            <Trash2 size={18} /> {t('photo.remove')}
          </button>
        )}
        {hasCamera && (
          <button className="btn" type="button" onClick={() => cameraInput.current?.click()} disabled={busy}>
            <Camera size={18} /> {t('photo.take')}
          </button>
        )}
        <button className="btn" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          <ImagePlus size={18} /> {t('photo.choose')}
        </button>
      </div>
      <input ref={cameraInput} capture="environment" {...inputProps} />
      <input ref={fileInput} data-testid={testId} {...inputProps} />
    </section>
  );
}

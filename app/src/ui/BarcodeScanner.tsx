import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

/** Formatos de productos de consumo (EAN/UPC) y los más comunes en etiquetas. */
const WANTED_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
const SCAN_INTERVAL_MS = 200;

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // En una ref: si el padre pasa una función nueva en cada render, la cámara no se reinicia.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setError(t('scanner.cameraDenied'));
        return;
      }
      if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const supported = await BarcodeDetector.getSupportedFormats();
      const detector = new BarcodeDetector({ formats: WANTED_FORMATS.filter((f) => supported.includes(f)) });
      timer = setInterval(async () => {
        if (video.readyState < 2) return;
        const [code] = await detector.detect(video);
        if (code && !stopped) {
          stopped = true;
          navigator.vibrate?.(80);
          onDetectedRef.current(code.rawValue);
        }
      }, SCAN_INTERVAL_MS);
    }

    void start();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [t]);

  return (
    <Dialog title={t('scanner.title')} onClose={onClose}>
      {error ? (
        <p className="error" role="alert">{error}</p>
      ) : (
        <>
          <video ref={videoRef} className="scanner-video" muted playsInline />
          <p className="hint">{t('scanner.hint')}</p>
        </>
      )}
    </Dialog>
  );
}

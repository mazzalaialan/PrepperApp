/**
 * Entrega un archivo al usuario: en Android abre el menú "Compartir"
 * (Quick Share, Bluetooth, mensajería…) si el navegador acepta el tipo;
 * si no, lo descarga.
 */
export async function deliverFile(bytes: Uint8Array<ArrayBuffer>, name: string, mime = 'application/octet-stream'): Promise<'shared' | 'downloaded'> {
  const file = new File([bytes], name, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (err) {
    // El usuario cerró el menú: no es un error, pero tampoco se entregó.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

# Conversor de la biblioteca (ARQUITECTURA §11.2). Todo lo que necesita, en un
# contenedor: no hace falta instalar nada en el servidor. Sin OCR con IA (la
# CPU del servidor no tiene AVX): Tesseract clásico.
FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pandoc \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng \
      poppler-utils p7zip-full unzip \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY builder /app/builder
# Sin red mientras convierte: lo único que lee es la carpeta de origen.
# El código está en /app (WORKDIR); la colección se monta aparte y solo se lee como datos.
ENTRYPOINT ["python", "-m", "builder"]

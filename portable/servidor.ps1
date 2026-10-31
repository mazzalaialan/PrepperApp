# VikArg Survival - servidor local para usar la app sin internet (Windows).
# Usa solo PowerShell, que viene con Windows: no hace falta instalar nada.
# Sirve la carpeta "app" en http://localhost:47613 y abre el navegador.
#
# El puerto es siempre el mismo a proposito: el navegador guarda los datos
# por direccion, y con otro puerto la app aparece vacia.

param([switch]$NoBrowser)  # -NoBrowser: solo para pruebas

$ErrorActionPreference = 'Stop'
$Port = 47613
$Url = "http://localhost:$Port/"
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app')).TrimEnd('\') + '\'

$Types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.wasm' = 'application/wasm'
  '.txt' = 'text/plain; charset=utf-8'
}

if (-not (Test-Path (Join-Path $Root 'index.html'))) {
  Write-Host "No se encuentra la carpeta 'app' junto a este archivo. Descomprimi el paquete completo."
  Read-Host 'Enter para salir'
  exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Url)
try {
  $listener.Start()
} catch {
  Write-Host "El puerto $Port esta ocupado. Si VikArg ya esta abierto en otra ventana, usa esa."
  Write-Host 'Si no, cerra el programa que lo este usando y volve a intentar.'
  Read-Host 'Enter para salir'
  exit 1
}

Write-Host ''
Write-Host '  VikArg Survival esta funcionando en' $Url
Write-Host '  Deja esta ventana abierta mientras uses la app. Para terminar, cerrala.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $Url }

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $response = $context.Response
  try {
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/') -replace '/', '\')))
    $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()

    # Nada fuera de la carpeta "app"; una ruta sin extension es una pantalla de la app.
    if (-not $file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
      $response.StatusCode = 403
    } elseif (-not (Test-Path $file -PathType Leaf)) {
      if ($ext -eq '') {
        $file = Join-Path $Root 'index.html'
        $ext = '.html'
      } else {
        $response.StatusCode = 404
        $file = $null
      }
    }

    if ($file -and $response.StatusCode -eq 200) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $type = $Types[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $response.ContentType = $type
      # La app y su service worker se revisan siempre: asi una version nueva copiada en la carpeta se detecta.
      if ($ext -eq '.html' -or $path -eq '/sw.js') { $response.Headers.Add('Cache-Control', 'no-cache') }
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $response.StatusCode = 500
  } finally {
    $response.Close()
  }
}

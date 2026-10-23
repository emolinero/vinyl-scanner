# Vinyl Scanner

PWA móvil para identificar ediciones de vinilos a partir de EAN/UPC.

## MVP actual

- Escaneo con cámara usando ZXing.
- Ingreso manual de barcode.
- Consulta a MusicBrainz.
- Filtrado de resultados a formatos Vinyl.
- Datos de país, fecha, sello, catálogo y formato.
- Manifest + service worker para instalación como PWA.

## Publicar con GitHub Pages

1. Abrir **Settings → Pages**.
2. En **Build and deployment**, elegir **Deploy from a branch**.
3. Seleccionar branch `main` y carpeta `/(root)`.
4. Guardar.

La URL esperada es:

https://emolinero.github.io/vinyl-scanner/

## Próximos pasos

1. Cruce contra `Colecciones — Curaduría`.
2. Cruce contra `Lista de Deseos Vinilos`.
3. Enriquecimiento con Discogs.
4. Identificación asistida por catálogo / matrix-runout.
5. Alta segura vía Google Apps Script.

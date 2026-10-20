# Comparación tipográfica aislada — dirección aprobada

**Aprobado por el usuario: Manrope + IBM Plex Mono.** La justificación y dirección están en [design.md §13](../../../design.md#13-propuesta-tipográfica-y-dirección-de-evolución--pendiente-de-aprobación). Esto es evidencia de una comparación, no una implementación ni una especificación alternativa. La ejecución aprobada sigue el [ExecPlan](../../exec-plans/completed/ui-ux-profesional.md), con estabilización funcional previa.

## Ver las parejas

Mismo contenido, tamaño, peso, paleta y disposición. Cada enlace muestra datos ficticios sin operaciones reales.

| Pantalla / ancho | Space Grotesk + IBM Plex Mono | Manrope + IBM Plex Mono |
| --- | --- | --- |
| Landing / 1440 | [PNG](evidence/landing-space-1440.png) | [PNG](evidence/landing-manrope-1440.png) |
| Landing / 390 | [PNG](evidence/landing-space-390.png) | [PNG](evidence/landing-manrope-390.png) |
| Chat / 1440 | [PNG](evidence/chat-space-1440.png) | [PNG](evidence/chat-manrope-1440.png) |
| Chat / 390 | [PNG](evidence/chat-space-390.png) | [PNG](evidence/chat-manrope-390.png) |
| Confirmación / 1440 | [PNG](evidence/confirmation-space-1440.png) | [PNG](evidence/confirmation-manrope-1440.png) |
| Confirmación / 390 | [PNG](evidence/confirmation-space-390.png) | [PNG](evidence/confirmation-manrope-390.png) |

Abrir `prototype.html?screen=landing&font=manrope` en un navegador local (o usar `screen=chat|confirmation`, `font=space`). Si el visor de archivos omite query strings, usar el render automatizado. No requiere servidor, Next, cuenta ni entorno. Usa archivos de fuentes locales. El nombre textual GALCOA+ es un marcador de posición del estudio, no reemplazo del logo SVG.

## Reproducir

Desde la raíz, con dependencias y Chromium de Playwright ya instalados:

```sh
node docs/design-experiments/typography-2026-10-20/render.mjs
```

El script lanza un Chromium headless **propio**, no usa CDP remoto ni el navegador compartido, y lo cierra al terminar. Renderiza archivos `file:` fuera de rutas productivas. No lee `.env` ni usa servicios de negocio. Solo descarga fuentes/licencias públicas si faltan los assets; con ellos presentes el render no requiere red. No cambia dependencias, configuración ni componentes.

Fuentes latinas WOFF2: Manrope y Space Grotesk variables 400–700; IBM Plex Mono 400 para referencias. URLs de origen en [`assets/sources.json`](assets/sources.json), licencias SIL OFL en `assets/*-OFL.txt`. El script verifica formato WOFF2 y rango variable al descargar para no confundir un archivo regular estático con toda la escala. No demuestra equivalencia exacta de versión con el bundle `next/font` desplegado.

## Evidencia obtenida el 20/10/2026

- 3 pantallas × 2 parejas × 4 anchos (1440/768/390/320) = **24 vistas** sin overflow horizontal.
- **12 capturas** a 1440 y 390 inspeccionadas visualmente; 768/320 solo geometría automatizada.
- [`metrics.json`](evidence/metrics.json): altura/interlínea de título y párrafo representativo; casilla de confirmación vacía; familias realmente usadas informadas por `CSS.getPlatformFontsForNode` de Chromium, no solo `font-family` declarado.
- CDP puede mostrar nombres internos como `Manrope ExtraLight` y `Space Grotesk Light` para fuentes variables; sus nombres PostScript reflejan la instancia. No significa que se haya renderizado con una sans del sistema.

Se inspeccionaron acentos, ñ, nombres compuestos, cantidades, importes y fechas del mismo contenido español. Las diferencias de líneas dependen también de métricas de glifos y unidades `ch`; no se presentan como superioridad universal de legibilidad ni ahorro de espacio.

**No comprobado por este estudio:** componentes reales, producción, envío/rechazo, flujo autenticado, estados de error/carga/éxito, AA global, navegación completa por teclado, zoom 200%, Safari, dispositivo físico, carga/fallback/CLS de Next o animaciones. El prototipo intencionalmente no permite confirmar/rechazar y no sustituye pruebas de INV-11–18. No se ejecutaron suites productivas como parte de la comparación; la evidencia posterior de ejecución está en el ExecPlan.

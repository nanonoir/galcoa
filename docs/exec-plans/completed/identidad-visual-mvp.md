# Identidad visual mínima para el MVP

## Objetivo
Adaptar la interfaz existente a `design.md` sin rediseñar pantallas ni cambiar comportamiento. Alcance: tokens compartidos, marca en encabezados y correcciones visuales indispensables. Conservar Geist, componentes, rutas, contratos y estados actuales. No incluye landing nueva, ilustraciones, animaciones, dependencias ni exportables.

## Ejecución
- [x] Aplicar paleta oscura verde/amarillo y radios rectos mediante tokens compartidos; conservar errores y foco accesibles.
- [x] Integrar marca existente y revisar colores fijos del recorrido acceso → dashboard → documento/revisión, sin alterar layouts.
- [x] Validar componentes, barreras, tipos, lint, build y navegador móvil/escritorio. Revisar diff y cerrar.

## Criterio de cierre
Identidad coherente, controles legibles y navegación/estados intactos. No ampliar alcance por detalles secundarios.

## Implementation Outcome

### Implemented
- `globals.css`: paleta oscura con green `#174235` y yellow `#fcd34d` sobre tokens existentes, radios rectos (`0`), y fallback Geist para preview.
- Integración de marca: logo original `public/galcoa.svg` integrado y recortado con CSS en encabezado privado y navegación landing, sin modificar los SVG originales.
- Preview: configuración de `publicDir` para servir `public/galcoa.svg`.
- E2E: expectativa de radio en pruebas actualizada a `0`.
- Sin alteraciones en lógica de negocio ni dependencias. El encabezado privado solo reemplaza su etiqueta textual por el logotipo.

### Deviations from Design
- La fuente de diseño `design.md` conserva su estado original no versionado.
- Se preservaron ambos SVG originales (`public/galcoa.svg` y `public/galcoa-logo.svg`); el ajuste visual se realizó mediante recorte CSS.
- Primer preview falló por expectativa previa de radio > 0 en E2E; corregida a 0 y suite completa repetida en verde.

### Validation
Validación ejecutada y aprobada por el agente principal:
- Lint completo: aprobado.
- Typegen Supabase y `tsc`: aprobados.
- Vitest: 1341 tests en 86 archivos aprobados.
- Barreras de arquitectura: 69 tests aprobados.
- Playwright: preview (87 tests) y responsive-a11y next (51 tests) aprobados.
- Build de producción: aprobado.
- Diff check: `git diff --check` aprobado.
- Inspección visual: capturas temporales en desktop y móvil obtenidas con navegador; agente principal inspeccionó móvil confirmando logo legible, fuentes sans y sin overflow.
- Revisión: autorrevisión del agente principal; sin revisión independiente.
- Alcance visual acotado; no se volvió a probar backend real.

### Follow-up
- `public/galcoa.svg` ahora es dependencia de runtime que debe incluirse al empaquetar y entregar.
- Se agrega `src/app/icon.svg` como icono de aplicación de Next.js, copiado del isotipo cuadrado `public/galcoa-logo.svg`; Next lo publica automáticamente como favicon/icono.
- `design.md` se incluye en la entrega a petición expresa del usuario.
- Entrega autorizada expresamente: commit/push a `develop` y PR nuevo a `main`; PR anterior #137 cancelado. Sin merge.

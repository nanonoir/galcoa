# ExecPlan — Estilo visual «roadmap» con cambios mínimos

Estado: propuesto (2026-10-17). Pedido directo del usuario. Pendiente de aprobación para ejecutar. Se ejecuta **después** de [mvp-demo-happy-path](mvp-demo-happy-path.md) porque ambos tocan encabezados de página.

## Objetivo

Acercar la app al estilo de la captura de referencia (slide «Roadmap y equipo») tocando lo mínimo: tokens globales, tipografía, fondo, encabezado y unas pocas clases utilitarias. Corregir el logo, que hoy se ve sobre un rectángulo blanco.

Rasgos de la referencia que se adoptan:

- Lienzo verde casi negro con **retícula de líneas finas** de fondo.
- Encabezado: logo sobre fondo oscuro, metadato en mono mayúsculas (`HEDERA · NEA TECH 2026`), divisor vertical, migas en mono (`11 / ROADMAP`) y **bloque amarillo** a la derecha.
- Titulares en **amarillo**, sans geométrica (Space Grotesk).
- **Etiqueta-eyebrow**: chip amarillo con texto verde, mono mayúsculas.
- Metadatos y etiquetas en **IBM Plex Mono** mayúsculas con tracking.
- Paneles rectangulares con borde fino `#35443c`, sin radio ni sombra; chips con borde y cuadradito verde.

Esto ya es coherente con `design.md` (§3 tipografía, §4 retícula, §5 header, §6 componentes); hoy solo falta aplicarlo.

## Diagnóstico del logo

- `public/galcoa.svg` es vectorial, **sin fondo**: 8 trazos verde `#14453A` (isotipo y wordmark «GALCOA») y 2 amarillo `#FDCF4C` (tilde y «+»).
- El fondo blanco viene del CSS: `.galcoa-brand` en `src/app/globals.css:174` pinta `background: #f5f4ec`. Se agregó porque el wordmark verde oscuro no se lee sobre el lienzo oscuro.
- En la referencia el wordmark es **crema** y el isotipo conserva verde y amarillo.

## Cambios (mínimos)

1. **Logo para fondo oscuro**
   - Crear `public/galcoa-on-dark.svg`: copia de `galcoa.svg` sin el bloque `<metadata>` (C2PA de 60 KB), recortando el `viewBox` al contenido y pintando de `#F5F4EC` solo los trazos del wordmark. El isotipo queda verde con su tilde amarillo y el «+» queda amarillo. Los trazos se identifican por su caja delimitadora; si el isotipo verde no contrasta lo suficiente, se le agrega un borde fino crema.
   - Mantener intacto el `galcoa.svg` original. Lo usan el ícono y los exportables.
   - `.galcoa-brand`: sin color de fondo y con `url('/galcoa-on-dark.svg')`, `background-size: contain`, altura de alrededor de 28 px. Se aplica a los dos usos: `src/app/(app)/layout.tsx:18` y `src/features/marketing/components/site-navigation.tsx:49`.
2. **Tipografía** (`src/app/layout.tsx` y `globals.css` `@theme`)
   - Reemplazar Geist y Geist Mono por `Space_Grotesk` e `IBM_Plex_Mono` de `next/font/google`. No es una dependencia nueva.
   - `--font-sans`, `--font-heading` y `--font-mono` apuntan a esas fuentes. El fallback del preview sigue funcionando.
3. **Fondo con retícula** (`globals.css`, `body`)
   - `background-image` con dos `linear-gradient` de 1 px `rgba(53,68,60,.35)` cada 96 px, fijo y sin imágenes. Se desactiva en la impresión.
4. **Encabezado privado** (`src/app/(app)/layout.tsx`)
   - Alto de 64 px y borde inferior de 1 px.
   - Logo, después el metadato mono `HEDERA · TESTNET`, un divisor vertical y la navegación «Mis documentos» en mono mayúsculas.
   - A la derecha, un bloque amarillo de alto completo con «Salir». Se reutiliza `LogoutButton` con clases; no cambia su lógica.
   - Contenedor ancho `max-w-6xl`, alineado con la retícula.
5. **Utilidades en `globals.css` `@layer components`** (sin componentes nuevos)
   - `.eyebrow`: fondo `--primary`, texto `--primary-foreground`, mono, `text-xs`, uppercase, `tracking-wider`, `px-2 py-1`.
   - `.tech-label`: mono, `text-xs`, uppercase, `tracking-wider`, `text-muted-foreground`.
   - `.page-title`: `text-primary`, `font-medium`, `tracking-tight`, `text-4xl md:text-5xl`.
   - `.panel`: `bg-card`, borde de 1 px y `p-6`.
6. **Aplicación puntual** en los títulos de las pantallas principales, solo clases y sin cambiar la estructura:
   - **Dashboard:** eyebrow «MIS DOCUMENTOS» y título en amarillo.
   - **Documento:** el título editable pasa a `.page-title` y arriba va un eyebrow «DOCUMENTO».
   - **Revisión:** eyebrow «REVISIÓN Y CONFIRMACIONES» y título en amarillo.
   - **Paneles de finalización y avance:** `.tech-label` en los rótulos («SELLO HCS», «FINALIZACIÓN»).
   - **Hashes, topic, secuencia y referencias:** en mono, como pide `design.md` §6.
7. **Botón `outline`** (`src/components/ui/button.tsx`): fondo `--card` y borde `--border`, como los chips de la referencia. Es un cambio de variante; no toca su API.

## Fuera de alcance

- El PDF y los exportables siguen claros (`design.md` §3).
- No se agregan dependencias nuevas ni se cambian layouts o comportamiento.
- La landing no se rediseña: solo recibe el logo, la tipografía y el fondo heredados.
- No se modifican el contenido ni los estados.

## Validación

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` y `npm run build`.
- `npm run test:e2e`, en particular `tests/e2e/responsive-a11y.spec.ts` (contraste, radio 0, sin desbordes en móvil).
- Capturas en escritorio (1440 px) y móvil (390 px) de acceso, dashboard, documento y revisión. Se comparan con la referencia: logo sin rectángulo blanco y legible, titulares en amarillo, retícula visible pero sutil.
- Contraste AA:
  - crema `#F5F4EC` sobre `#101411`;
  - amarillo `#FCD34D` sobre `#101411`;
  - verde `#174235` sobre amarillo en el eyebrow y el bloque del encabezado.

## Riesgos

- Cambiar la tipografía mueve un poco los anchos: puede romper capturas o tests e2e que miden tamaños.
- Elegir mal qué trazos son del wordmark: se verifica visualmente antes de cerrar.

## Progreso y evidencia

Ejecutado el 2026-10-17 (puntos 1–5, 7 y parte del 6; sin commit).

**Hecho**
- Logo: `public/galcoa-on-dark.svg` generado por script (sin `<metadata>`, viewBox recortado 1232×312, wordmark `#F5F4EC` en 6 trazos, isotipo verde con borde crema de 6 u porque el verde solo da ~1,65:1 sobre el lienzo, tilde y «+» amarillos). Verificado con render a PNG. `galcoa.svg` y `icon.svg` intactos. `.galcoa-brand`: sin fondo, 110×28 px, `contain`.
- Tipografía: `Space_Grotesk` e `IBM_Plex_Mono` (400/500/600) vía `next/font/google` en `src/app/layout.tsx`; `@theme` apunta a `--font-space-grotesk` y `--font-ibm-plex-mono`. Comprobado en el navegador: `body` y `h1` resuelven a Space Grotesk.
- Retícula de 96 px en `body` (fija, desactivada en impresión) y utilidades `.eyebrow`, `.tech-label`, `.page-title`, `.panel` en `globals.css`.
- Encabezado privado: 64 px, logo, `HEDERA · TESTNET` (oculto bajo `sm`), divisor, «Mis documentos» en mono, y bloque amarillo de alto completo con `LogoutButton` (ahora acepta `className`; lógica sin cambios). Contenedor `max-w-6xl` en header, dashboard, documento y revisión; también en la barra de la landing.
- Botón `outline`: `bg-card` + `border-border`, sin variantes `dark:`.
- Títulos: dashboard (eyebrow «Mis documentos» + `.page-title`, ya no `sr-only`), documento (eyebrow «Documento» + `DocumentTitleEditor` con `.page-title`; el input de edición pasa a `font-medium`), revisión (eyebrow «Revisión y confirmaciones» + `.page-title`).

**Validación**
- `npm run lint`: sin salida de error. `npm run typecheck`: OK. `npm run test:boundaries`: 4 archivos / 69 tests OK. `npm test`: 92 archivos / 1382 tests OK. `npm run build`: OK.
- Playwright `responsive-a11y.spec.ts` + `preview.spec.ts`: 125 pasaron, 14 fallaron, todos en el proyecto `preview` (escenarios de dashboard MVP-111 y snapshot MVP-112). Buscan textos de contenido («Fuentes: msg-0002», «Se registró una medición de 7 sin unidad indicada.») que vienen de `dashboard-reference` y `snapshot-view`, archivos que edita el otro implementer. No son de estilo. No se reejecutaron sin esos cambios, así que está pendiente confirmar que no son anteriores.
- Contraste: crema/lienzo 16,84; amarillo/lienzo 12,89; verde/amarillo 7,80; muted/lienzo 10,51 (todos AA).
- Capturas (1440 y 390) de landing y acceso con `next dev`: lienzo oscuro con retícula sutil, logo sin rectángulo blanco (wordmark crema), CTA amarillo con texto verde, paneles rectos de borde fino. Sin desbordes en 390. Dashboard y documento privados no se capturaron (requieren sesión); el preview no los usa dentro del layout privado, así que el encabezado privado nuevo **no se vio renderizado**, solo pasó lint/typecheck/build.

**Pendiente (fase 2)**
- `.tech-label` en `finalization-panel` y `review-progress`, y eyebrow del `dashboard-reference` (archivos del otro implementer).
- Mono en hashes, topic, secuencia y referencias (`design.md` §6) dentro de esos mismos componentes.
- La etiqueta de `LogoutButton` sigue siendo «Cerrar sesión» (el plan decía «Salir»): cambiarla exige actualizar `auth-containers.test.tsx` y e2e.
- Captura visual del encabezado privado con sesión real/local.

### Fase 2 (2026-10-17, sin commit)

**Hecho**
- `.tech-label` en rótulos: «Finalización» (`finalization-panel`), `dt` de `review-progress`, `Dimension` de `dashboard-reference` y su subtítulo/fecha, `dt` de `snapshot-view` y `public-verifier`, y «Finalización»/«Sello HCS» de `version-history`.
- `.panel` en `finalization-panel` y en las tres celdas de `review-progress`; topic y secuencia del sello en `font-mono`. Hashes y referencias de `public-verifier` y las ids de revisión/snapshot del dashboard ya eran mono.
- Eyebrow del dashboard: la página privada ya lo pone («Mis documentos»), así que no se duplicó en `dashboard-reference`; ahí se aplicaron solo los rótulos.
- Fallos e2e del proyecto `preview`: causa confirmada. Con `DEMO_HIDE_WARNINGS = false` (temporal, restaurado a `true`) pasaban los 87 tests de `preview`. Se ajustó `tests/e2e/preview.spec.ts`: los escenarios con advertencias verifican ahora el contenido que sí se ve (título del documento o cuerpo del snapshot) y que el texto de advertencia/«Fuentes» NO aparezca (`hidden`). Los tests no se desactivaron.
- Botón de salida: se deja «Cerrar sesión» (cambiarlo exige tocar tests de auth y e2e).

**Validación**
- `lint` y `tsc`: sin errores. `test:boundaries`: 69 OK. `build`: OK.
- `npm test`: 91 archivos OK y 3 fallan (9 tests): `site-navigation.test.tsx`, `landing-page.test.tsx` y `preview/registry.test.tsx` (landing). Causa: `site-navigation.tsx` fue reescrito por otro cambio en curso (sin enlaces ni menú móvil; recibe `action`); no es de esta fase.
- Playwright `responsive-a11y` + `preview`: 132 OK, 7 fallan, todos del menú de la landing (MVP-114 en `preview` y «landing móvil» en `next`) por esa misma reescritura. Los 14 fallos anteriores (MVP-111/112) quedaron en verde.

**Pendiente**
- Actualizar los tests del menú de la landing (unitarios y e2e) a la nueva `site-navigation`, o revertirla: decisión de quien la reescribió.

### Superposición y evolución en ui-ux-profesional.md (2026-10-20)

El trabajo exploratorio inicial de este plan sobre tokens, encabezados, utilidades de retícula y componentes (puntos 1–7) queda superpuesto y absorbido en sus fundamentos y pantallas por el plan completado [`docs/exec-plans/completed/ui-ux-profesional.md`](../completed/ui-ux-profesional.md).

**Evidencia de superposición y estado:**
- **Tipografía y fuentes:** la propuesta inicial de Space Grotesk vía Google Fonts fue sustituida formalmente por la pareja aprobada **Manrope (variable local) + IBM Plex Mono (local)** con licencias locales en `public/fonts/`, idénticas entre Next y Vite preview, eliminando dependencias externas de red.
- **Jerarquía de color:** el enfoque de títulos completamente amarillos fue superado a favor de **titulares neutros (`#F5F4EC`)**, reservando el amarillo (`#FCD34D`) para llamadas a la acción (CTA), foco y acentos puntuales de marca, resolviendo el diseño canónico en `design.md` §3 y §13.
- **Componentes y utilidades compartidas:** las clases `.tech-label`, `.tech-id`, `.panel`, así como la normalización de geometría recta (`--radius: 0px`), alturas mínimas táctiles de 44 px, variantes de botón y navegación de cabecera privada/pública fueron consolidadas y validadas integralmente en `ui-ux-profesional.md` (con 101 archivos, 1444 tests Vitest, 69 comprobaciones de barreras y 142 tests E2E pasando en verde).
- **Estado del plan:** este plan permanece en estado **ACTIVO** en `docs/exec-plans/active/` para preservar el registro histórico compartido sin cierre unilateral; su alcance funcional y estético queda continuado y completado en `ui-ux-profesional.md`.

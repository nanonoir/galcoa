# ExecPlan — Paleta institucional de GALCOA+

Estado: COMPLETADO Y ARCHIVADO — Implementación final integrada y verificada; revisión independiente PASS WITH FINDINGS (sesión ses_ea77127bdffenMrm7bKozOMyDG); hallazgos finales subsanados y validados (sesión ses_ea769a1b1ffejnqs5nQ046jfWV).
Fecha: 2026-10-20.

## Objetivo

Aplicar la paleta aportada por el usuario con roles coherentes y contraste accesible, preservando composición, tipografía, geometría y movimiento. **Dirección vigente (corregida por el usuario el 2026-10-20):** interfaz dominantemente AZUL NOCHE muy oscuro (lienzo derivado de `#1E3A5F`, `#0C1A2E`), paneles en azul institucional, texto blanco, verde de identidad y amarillo de acción; sin fondo blanco masivo ni azul medio plano en toda la pantalla, y sin selector de tema. La propuesta inicial «predominantemente clara» quedó descartada (se conserva abajo como evidencia histórica).

## Referencias y contexto

- Referencia cromática: imagen del usuario, azul institucional `#1E3A5F`, verde GALCOA+ `#176A57`, blanco `#F7F8F6`, amarillo de acción `#FFDA47`.
- Fuente visual canónica: [design.md](../../../design.md). Sus reglas de identidad y fondo oscuro reconciliadas con la dirección implementada; ratios de contraste calculados en §2.
- [Arquitectura](../../architecture.md), [desarrollo y validación](../../development.md), [PRD](../GALCOA-PRD-v1.4.md).
- Trabajo relacionado: [movimiento profesional](movimiento-profesional.md), completado y archivado. Preservar sus cambios, pruebas y feedback; revalidar su estado antes de intervenir archivos compartidos.
- Existen numerosos cambios locales anteriores sin commit. No revertir, reformatear ni atribuir al cambio cromático todo el diff existente.

## Alcance y exclusiones

Incluye tokens compartidos, estilos y colores literales de marketing, acceso, navegación privada, dashboard, chat, historial, revisión, confirmación, resultado, verificador, primitivas UI y preview. Cubrir estados hover, foco, seleccionado, presionado, deshabilitado, carga, vacío, error y éxito.

No incluye cambios de lógica de negocio, texto legal o promesas de producto; Auth/RLS, API, proveedores, migraciones, smart contracts, PDFs/versiones finalizadas, nueva tipografía, rediseño de layouts, nuevas animaciones, dependencias, selector de tema, commit, push o despliegue. No leer `.env` ni secretos. No realizar operaciones remotas de negocio como parte de una revisión cromática.

## Roles de color

| Color base | Rol previsto | Restricción |
| --- | --- | --- |
| Azul `#1E3A5F` | Azul base institucional: paneles protagonistas, popovers, muted, navegación activa; de él se deriva el lienzo navy `#0C1A2E` | Lienzo más oscuro que el azul base; el blanco solo como texto |
| Verde `#176A57` | Marca, enlaces/selección y estados positivos compatibles | Separar identidad de estado; usar texto o iconos para comunicar significado |
| Blanco `#F7F8F6` | Fondo principal y lectura | Derivar superficies y bordes que permitan distinguir agrupaciones |
| Amarillo `#FFDA47` | CTA principal y énfasis puntual | Texto azul `#1E3A5F` sobre el botón; foco amarillo sobre navy/azul; no usarlo sobre la excepción `.surface-light` |

Derivar neutros y tonos de superficie/borde con moderación. Conservar colores semánticos accesibles de error, advertencia e información: los cuatro colores de marca no sustituyen todas las necesidades funcionales. Calcular contrastes reales, sin reutilizar ratios de la paleta anterior ni asumir que una variante opaca conserva contraste sobre cualquier fondo.

## Pasos de ejecución

### 1. Inventario y mapa cromático

- [x] Leer instrucciones y guías pertinentes; relevar tokens CSS, variantes de componentes, clases literales, estilos inline y preview.
- [x] Inspeccionar uso real de tema/ThemeProvider y superficies invertidas para evitar que una regla oscura o una preferencia persistida revierta la propuesta. No introducir ni retirar capacidades de tema sin investigar su intención.
- [x] Mapear cada token semántico existente a su rol nuevo: background/foreground, card, popover, primary, secondary, accent, muted, border, input, ring, destructive y sidebar donde existan.
- [x] Identificar assets de marca con color incrustado; preservar identidad reconocible sin recolorear logos externos (incluido Hedera) ni artefactos finalizados.

### 2. Fundamentos y muestras representativas

- [x] Implementar tokens de marca y semánticos centralizados, evitando reemplazos globales de hex sin contexto.
- [x] Ajustar superficies invertidas mediante roles explícitos, de modo que botones, vínculos, texto secundario y foco sigan contrastando en hero/cabecera azul.
- [x] Aplicar primero a landing/hero, dashboard y chat; revisar escritorio y móvil con estados de interacción antes de extender el patrón.
- [x] Mantener Manrope/IBM Plex Mono, radios rectos, espaciado, tamaños y utilidades de movimiento existentes.

### 3. Extensión y coherencia

- [x] Extender a acceso y recuperación, navegación, formularios, menús, tooltips, diálogos, adjuntos, historial y revisión/confirmación.
- [x] Adaptar resultado, copia, referencias y verificador público; conservar legibilidad de hashes y estados no exitosos.
- [x] Reconciliar preview con Next mediante tokens compartidos o referencias existentes, sin duplicar paletas divergentes.
- [x] Auditar residuos de la paleta antigua, diferenciando colores históricos de fixtures/assets legítimos; no eliminar documentación histórica ni snapshots de versiones finalizadas.
- [x] Actualizar las secciones vigentes de `design.md` (dirección, paleta, contraste, tokens y ejemplos) con decisiones implementadas y ratios calculados.

### 4. Validación y revisión

- [x] Verificar WCAG AA: 4.5:1 para texto normal, 3:1 para texto grande, y 3:1 para límites/indicadores necesarios de controles y foco conforme al criterio aplicable. Documentar combinaciones probadas y excepciones de controles inactivos, sin presentar excepciones como objetivo de diseño.
- [x] Comprobar foco por teclado sobre claro y azul, errores con texto/icono, botones deshabilitados distinguibles y estados que no dependan solo del color.
- [x] Tests focalizados de componentes que cambien y pruebas de regresión necesarias; lint, typecheck y barreras. Build al integrar; E2E preview/Next según superficies afectadas.
- [x] Inspección visual real en escritorio/móvil de pantallas y estados representativos. Usar fixtures o preview para pantallas privadas si no se valida contra backend, y declarar ese límite.
- [x] Verificar que hover, selección del hero, revelado y movimiento reducido mantienen contraste durante y después de las transiciones.
- [x] Mantener servidor local del usuario; cualquier servidor de validación propio se identifica y limpia sin detener procesos ajenos. Si el dev lock impide E2E, usar instancia aislada compatible con build/config temporal, sin cambiar permanentemente los checks.
- [x] Revisión independiente de consistencia visual, accesibilidad y regresiones; corregir hallazgos y repetir checks afectados.
- [x] Registrar evidencia, decisiones y límites; delegar cierre y archivo al archiver, sin cerrar planes compartidos ni editar contadores ajenos.

## Coordinación propuesta

Primero el orquestador resuelve tokens y superficies invertidas. Luego, si conviene, dos implementers con archivos disjuntos: marketing/acceso y features privadas/públicas; estilos globales, primitivas compartidas, preview y `design.md` quedan bajo un único responsable. Máximo tres carriles. Integración, revisión independiente y cierre posteriores.

## Criterios de aceptación

1. Los cuatro valores de marca coinciden con la referencia y sus roles son consistentes en toda la app.
2. La interfaz dominantemente azul noche conserva jerarquía, marca y lectura; texto, controles y foco contrastan sobre lienzo, panel y panel de marca.
3. No quedan mezclas accidentales de tokens de la paleta antigua (verde `#174235`/amarillo `#FCD34D`) ni superficies blancas masivas; `.surface-light` solo como excepción funcional.
4. Estados, foco y errores son accesibles y no dependen únicamente del color.
5. Flujos, tipografía, layouts y animaciones conservan su comportamiento; PDFs y versiones finalizadas no se modifican.
6. Checks y revisión visual se respaldan con evidencia nueva; los límites y cualquier decisión pendiente se declaran explícitamente.

## Evidencia y decisiones

Documento creado a pedido del usuario.

### 2026-10-20 — Corrección de dirección: azul noche (vigente)

El usuario rechazó la interfaz clara y luego aportó dos referencias: lienzo navy casi negro, no azul medio plano. Estado final de fundamentos:
- Lienzo `:root`: `#0C1A2E` (derivado de `#1E3A5F`, sin medición de píxeles contra las referencias); card `#13263F`; popover/muted `#1E3A5F`; accent `#27476F`; texto `#F7F8F6`; muted-foreground `#B5C3D6`; input `#8FA3BD`; border `#2B4566`; ring/primary `#FFDA47`; success `#6FD0B2`; destructive `#FFB3AD`; sidebar `#081423`. Retícula `rgb(111 150 190 / 0.12)`.
- `.surface-inverse` = panel de marca `#1E3A5F` (card `#27476F`); `.surface-light` solo excepción funcional.
- Ratios sobre fondos finales (detalle en `design.md` §2): blanco 16.39 lienzo / 14.32 card / 10.80 `#1E3A5F`; muted-fg 9.76 / 8.53 / 6.43; amarillo 12.78 / 11.17 / 8.42; success 9.43 / 8.24 / 6.21; input 6.77 / 5.91 / 4.46; blanco sobre verde 6.09; verde como texto sobre lienzo 2.69 (prohibido).
- `sonner.tsx` fijado a `theme="dark"`. Las notas «claro» de abajo son históricas.
- Confirmación del usuario («imitar la imagen 1 con detalles lindos, mantener líneas/cuadrículas»): retícula azul/teal `rgb(111 170 190 / 0.14)` conservada y nodos estáticos en el fondo del `body` (teal en cada intersección, amarillos en 2 de cada 30 celdas). Verificado en el preview Vite aislado (puerto 5191, ya detenido): retícula, nodos teal y amarillos visibles sin tapar texto. El servidor de `localhost:3000` (PID 21400) sirve una compilación anterior y no refleja el cambio hasta que se recompile; no lo toqué. Sin loops, glows ni nuevas fuentes; layouts sin cambios.

### 2026-10-20 — Fundamentos, primera versión (HISTÓRICA, reemplazada por la corrección anterior)

- Tema: no existe ThemeProvider ni selector; la clase `.dark` nunca se aplicaba (la app era oscura por valores en `:root`). Las variantes `dark:` de shadcn quedan inertes. `sonner.tsx` pasó a `theme="light"` para no seguir el modo del SO.
- `globals.css`: tokens de marca (`--brand-blue/green/white/yellow`), semánticos claros por defecto, `--success`/`--warning`, utilidades `bg-brand-*`, `text-success`, `text-warning`; `.surface-inverse` (azul) y `.surface-light` (isla clara) re-mapean tokens; retícula del body recolorada. Movimiento, fuentes y radio 0 intactos.
- `button.tsx`/`badge.tsx`: variante `link` pasa de `text-primary` (amarillo, ilegible sobre claro) a `text-success`.
- `design.md` §1(5), §2 y §9 reconciliados con ratios calculados; §3–§8, §10–§13 aún mencionan la paleta antigua en texto histórico (nota al inicio de §2).
- Validación: eslint `src/components/ui` y `tsc --noEmit` sin errores; compilación Tailwind de `globals.css` OK; vitest `src/components` 3/3. No se ejecutó build, E2E ni inspección visual.
- Pendiente: adopción de `.surface-inverse` y retirada de usos inválidos de `border-primary`/`text-primary` en features; logo sobre claro; revisión visual; el resto del plan.

### 2026-10-20 — Integración y validación (implementer)

**Integración.**
- `.surface-inverse` retirado del hero de la landing (`landing-page.tsx`): el panel opaco `#1E3A5F` tapaba la retícula. Se conserva en las cabeceras de marketing y acceso (`site-navigation.tsx`, `(auth)/layout.tsx`). Indentación del hero corregida.
- Casillas y slider (`confirmation-screen.tsx`, `participant-selector.tsx`, `chat-reference.tsx`): `accent-secondary` (verde `#176A57`, 2.69:1 sobre el lienzo) pasa a `accent-success` (`#6FD0B2`, 9.43:1 sobre el lienzo, 8.24 sobre card). Quedan `bg-black/60` en overlays de diálogo/sheet (scrim, legítimo) y `bg-white` en el lienzo del QR (excepción funcional).
- Sin residuos de `#174235`/`#FCD34D` en `src/`.

**Ajustes de marca (pedidos del usuario durante la integración).**
- Logos en cabeceras: nuevo `src/components/ui/brand-lockup.tsx` (GALCOA+ + Hedera, fondos CSS, sin `next/image` por la barrera de presentación y el test «sin imágenes» de la landing). Usado en `site-navigation.tsx`, `(auth)/layout.tsx`, `(app)/layout.tsx` y `public-brand-header.tsx`. Etiqueta «Hedera · Testnet» → «Testnet» (solo `xl`) donde ya hay logo Hedera.
- Primer intento al 3× literal rompió la cabecera y se revocó por pedido del usuario. Tamaños finales (alto, ancho derivado de la proporción del SVG): GALCOA+ 28/36/40 px → 85/109/121 px de ancho en móvil/≥640/≥1024; Hedera 22/28/32 px → 71/90/103 px. Antes: 110×28 (logo anterior, ya sin uso). Cabecera conservada en 64 px.
- Causa de la invisibilidad: `public/galcoa.svg` (nuevo, `#1E3B60`/`#2463EC`) y `public/hedera.svg` (`#0A0A0A`) son transparentes pero oscuros, pensados para fondo claro; sobre navy casi no se ven. Con autorización del usuario se crearon variantes derivadas, sin tocar los originales ni usar filtros CSS: `public/galcoa-on-navy.svg` (wordmark `#F7F8F6`, isotipo `#176A57` con borde crema, check y «+» `#FFDA47`) y `public/hedera-on-navy.svg` (negativo `#F7F8F6`; sin placa blanca). Se quitó el `<metadata>` C2PA de las derivadas (ya no serían válidas). `galcoa-on-dark.svg` fue eliminado por el usuario/otro agente; ya no se referencia. Computed style: sin `filter` ni `mask`.
- Landing: «Alcance» eliminado por completo (sección, ancla `#alcance` y entradas de navegación en `landing-content.ts` y `src/mocks/marketing.ts`). El contrato `limits` de `LandingContent` queda sin renderizar en la landing (no se modificó el contrato). El PRD solo pide «landing simple» (§13); no hay disclaimer obligatorio en la landing, y las menciones a Testnet persisten en el recorrido del hero y en acceso. «Cómo funciona» pasó a la columna izquierda del hero, bajo «Crear cuenta», con entradas escalonadas `motion-enter` (160/220/280 ms) y hover sutil de fondo (no son botones); reduced-motion lo cubre el bloque global existente. Hero más compacto (relleno y `lg:text-[4rem]`).

**Validación ejecutada (2026-10-20).**
- `npm run lint`, `npm run typecheck`: sin errores. `npm test`: 103 archivos / 1452 tests OK (incluye `brand-lockup.test.tsx`, nuevo, y `landing-page.test.tsx` actualizado). `npm run test:boundaries`: 4 archivos / 69 OK. `npm run build`: OK.
- E2E completo (142 tests, proyectos preview y next) OK con config temporal (`next start` en `127.0.0.1:3100` sobre el build, más `preview:ui` en 4173; el `playwright.config.ts` no se modificó). Los servidores y la config temporal se limpiaron; no queda nada en 3100/4173.
- Visual real (Playwright MCP contra `localhost:3000`, 1440×900, 1280×720 y 360×740): landing, acceso, verify y confirm. Cabecera 64 px, sin desbordamiento horizontal, retícula y nodos visibles en hero y acceso, logos legibles, «Cómo funciona» completo sin scroll en 1440×900 y 1280×720 (borde inferior 702 px). En 360 px hay scroll (inevitable). Capturas en `docs/design-experiments/paleta-institucional-2026-10-20/evidence/` (`ev3-*` logos legibles, `ev4-*` landing final; `landing-*`, `ev-*`, `ev2-*` son iteraciones previas con el logo ilegible o con placa, conservadas solo como historial).

### 2026-10-20 — Revisión independiente (sesión ses_ea77127bdffenMrm7bKozOMyDG)

- Dictamen del revisor independiente: **PASS WITH FINDINGS**.
- Verificación independiente ejecutada:
  - `npm run lint`: OK.
  - `npm run typecheck`: OK.
  - `npm run test:boundaries`: 69/69 barreras arquitectónicas respetadas.
  - `npm test`: 1452 tests / 103 archivos OK.
  - `npm run build`: compilación de producción Next.js OK.
  - Runtime verification: HTTP 200, CSS navy (`#0C1A2E`), logos `on-navy` y jerarquía DOM confirmados en vivo.
- Hallazgos reportados para subsanación:
  1. Riesgo de escaneo de Tailwind sobre artefactos en `recordings/` que provocó previamente errores HTTP 500.
  2. Referencia desactualizada en `README.md` (línea 4) apuntando a un asset inexistente `galcoa-on-dark.svg`.
  3. Enlace de marca en `src/app/(app)/layout.tsx` sin `aria-label` explícito para accesibilidad.

### 2026-10-20 — Subsanación de hallazgos (sesión ses_ea769a1b1ffejnqs5nQ046jfWV)

- Se añadió `/recordings/` a `.gitignore` para garantizar que Tailwind omita archivos temporales y capturas durante el escaneo de clases.
- Se corrigió la línea 4 de `README.md` referenciando el asset real `public/galcoa-on-navy.svg`.
- Se incorporó `aria-label="GALCOA+, ir al inicio"` en el `<Link>` del brand lockup de `src/app/(app)/layout.tsx`.
- Verificación del fix ejecutada:
  - `git check-ignore -v recordings/test.log`: confirma que las grabaciones quedan ignoradas.
  - `npx eslint src/app/\(app\)/layout.tsx`: OK.
  - `npm run typecheck`: OK.
  - `npm run build`: OK.
  - *Nota:* Conforme a las instrucciones de contención y preservación de recursos, la suite completa de E2E no se repitió tras los fixes de marcado/docs/gitignore.

---

## Implementation Outcome

### Implemented

1. **Tokens y paleta azul noche:**
   - Lienzo base `:root` en `#0C1A2E` (azul de marca `#1E3A5F` oscurecido) con superficies semánticas (`card` `#13263F`, `popover`/`muted` `#1E3A5F`, `accent` `#27476F`, texto principal `#F7F8F6`, secundarios `#B5C3D6`, input `#8FA3BD`, borde `#2B4566`, foco/anillo `#FFDA47`, éxito `#6FD0B2`, destructivo `#FFB3AD`, sidebar `#081423`).
   - Retícula arquitectural de 96px con líneas en `rgb(111 170 190 / 0.14)` y nodos estáticos en el fondo del `body` (teal en cada intersección, amarillos en patrón de 6×5 celdas).
   - Cuatro colores de identidad exactos: Azul `#1E3A5F`, Verde `#176A57`, Blanco `#F7F8F6` y Amarillo `#FFDA47`.
   - `.surface-inverse` conservado para cabeceras y paneles de marca destacados en `#1E3A5F`; `.surface-light` (`#F7F8F6` sobre `#1E3A5F`) reservado como excepción funcional (e.g. lienzo del QR).

2. **Logos institucionales y proporciones de cabecera:**
   - Variantes derivadas `public/galcoa-on-navy.svg` (wordmark `#F7F8F6`, isotipo `#176A57` con borde crema, check y «+» `#FFDA47`) y `public/hedera-on-navy.svg` (negativo `#F7F8F6`), preservando los archivos originales (`public/galcoa.svg` y `public/hedera.svg`) sin alteración ni uso de filtros CSS/máscaras en tiempo de ejecución. Eliminación de metadatos C2PA en las variantes derivadas.
   - Creación de componentes reutilizables `src/components/ui/brand-lockup.tsx` y `public-brand-header.tsx`, renderizando mediante fondos CSS conformes a las barreras arquitectónicas de presentación (sin `next/image`).
   - Cabecera conservada en 64px con proporciones SVG armónicas adaptadas (GALCOA+ 28/36/40px de alto; Hedera 22/28/32px de alto), descartando escalados 3x que deformaban el layout.

3. **Evolución del recorrido de Landing:**
   - Eliminación integral de la sección «Alcance» (sección visual, ancla `#alcance`, entradas de menú en `site-navigation.tsx`, `landing-content.ts` y mocks de marketing), manteniendo el contrato de datos subyacente intacto.
   - Reubicación de «Cómo funciona» en la columna izquierda del Hero debajo de «Crear cuenta», con entradas escalonadas `motion-enter` (160/220/280 ms) y hover sutil.
   - Hero compactado y optimizado sin desbordamiento horizontal.

4. **Resolución de hallazgos de revisión independiente (Fix Agent `ses_ea769a1b1ffejnqs5nQ046jfWV`):**
   - Configuración de exclusión en `.gitignore` para `/recordings/` evitando que Tailwind escanee archivos de captura o logs HTML-escapados (resolución preventiva del incidente de CSS 500).
   - Corrección de referencia en línea 4 de `README.md` a `public/galcoa-on-navy.svg`.
   - Accesibilidad en cabecera privada de `src/app/(app)/layout.tsx`: adición de `aria-label="GALCOA+, ir al inicio"` en el enlace principal del brand lockup.

### Deviations from Design

1. **Dirección cromática general:** La propuesta inicial «predominantemente clara» fue descartada por solicitud explícita del usuario a favor de una interfaz dominantemente azul noche (`#0C1A2E`) con paneles institucionales y acentos de marca, sin selector de tema.
2. **Superficie del Hero:** Se retiró `.surface-inverse` del contenedor del hero en `landing-page.tsx` para evitar que el panel opaco `#1E3A5F` bloqueara visualmente la retícula y los nodos arquitecturales del fondo.
3. **Escala de marcas:** El intento de escalar los logos a 3x rompió el layout de cabecera; se calibraron proporciones responsive estrictas (GALCOA+ 28/36/40px, Hedera 22/28/32px) que respetan la altura fija de 64px.
4. **Logos derivados para fondo oscuro:** Debido a que los SVGs originales eran oscuros y pensados para fondo claro, se generaron variantes derivadas `*-on-navy.svg` sin filtros CSS en lugar de modificar los originales o forzar placas blancas.
5. **Sección «Alcance» eliminada:** Descartada de la landing para optimizar el espacio vertical y la jerarquía de conversión; el PRD no exige un disclaimer en landing y las aclaraciones de Testnet se mantienen en la navegación y en el flujo de acceso.

### Validation

1. **Validación del Implementer (pre-fix):**
   - `npm run lint` y `npm run typecheck`: 0 errores.
   - `npm test`: 103 archivos / 1452 tests pasando (incluyendo `brand-lockup.test.tsx` y actualizaciones de `landing-page.test.tsx`).
   - `npm run test:boundaries`: 4 archivos / 69 barreras arquitectónicas respetadas.
   - `npm run build`: compilación de producción exitosa.
   - `npm run test:e2e`: 142/142 tests passing en Playwright ejecutados contra instancia temporal `next start` en puerto 3100 y `preview:ui` en 4173; entorno temporal desmantelado limpiamente sin procesos huérfanos.
   - Inspección visual real con Playwright MCP contra `localhost:3000` (1440×900, 1280×720, 360×740): landing, auth, verify y confirm sin desbordamiento horizontal y con contraste legible.

2. **Revisión independiente (`ses_ea77127bdffenMrm7bKozOMyDG`):**
   - Calificación: **PASS WITH FINDINGS**.
   - Ejecución independiente de: `npm run lint`, `npm run typecheck`, 69 barreras arquitectónicas, 1452 tests unitarios/componentes (103 archivos), y `npm run build`.
   - Comprobación runtime HTTP 200 de CSS navy (`#0C1A2E`), logos `on-navy` y estructura DOM en vivo.

3. **Subsanación de hallazgos y verificación del fix (`ses_ea769a1b1ffejnqs5nQ046jfWV`):**
   - Validación de exclusión de Tailwind mediante `git check-ignore -v recordings/test.log` (excluido en `.gitignore`).
   - `npm run lint` sobre layout y accesibilidad: OK.
   - `npm run typecheck` y `npm run build`: OK.
   - *Nota de rigor:* La suite completa de Playwright E2E no fue re-ejecutada tras los fixes menores de marcado/docs/gitignore (no se afirma E2E post-fix).

### Follow-up

1. **Clases `dark:` inertes:** Se mantienen clases `dark:` residuales en componentes primitivos de shadcn; no generan impacto funcional ni bloqueo estético dado que no existe selector de tema ni clase `.dark`. Su limpieza queda como tarea de mantenimiento opcional (registrada como deuda técnica nº 13).
2. **Revisión visual de rutas privadas:** La inspección visual con navegador se realizó en rutas públicas y fixtures de componentes; la verificación visual completa de vistas privadas autenticadas `(app)` (dashboard, chat, revisión) con sesión real en navegador queda diferida a la validación de integración contra backend/despliegue autorizado (registrada como deuda técnica nº 13).
3. **Medición de accesibilidad en movimiento reducido:** El soporte de `@media (prefers-reduced-motion)` está implementado a nivel de tokens globales y probado en tests de clases, pero sin medición automatizada en navegador real en este lote (registrada como deuda técnica nº 13).
4. **Métricas de rendimiento:** Sin medición instrumentada de Core Web Vitals (CWV) en este lote.

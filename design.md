# GALCOA+ · DESIGN.md

> **Estado:** propuesta de dirección visual, lista para implementar y ajustar mediante revisión de pantallas reales.  
> **Producto:** GALCOA+, plataforma de documentación asistida por IA, verificación de consistencia y trazabilidad de evidencia.  
> **Referencia visual:** [Stellar Apex](https://stellarapex.org/) y captura proporcionada (17/10/2026).  
> **Alcance:** marketing/landing y criterios de adaptación a la aplicación. Este archivo define **cómo se ve y se comporta visualmente** el producto; no reemplaza su PRD ni determina capacidades legales o técnicas.
>
> **Revisión aprobada y reconciliación 20/10/2026:** el usuario aprobó **Manrope + IBM Plex Mono** y la evolución de jerarquías de [§13](#13-propuesta-tipográfica-y-dirección-de-evolución--pendiente-de-aprobación). §3 (Tipografía), §9 (Tokens CSS) y §11 (Checklist) quedan reconciliados formalmente con la dirección aprobada de §13 y la implementación local de UI/UX ([ExecPlan](docs/exec-plans/completed/ui-ux-profesional.md)): Manrope variable local como sans principal, IBM Plex Mono local reservada a metadatos técnicos/hashes, y titulares neutros (`#F5F4EC`) con amarillo reservado para acción/acento. El título de §13 se conserva para mantener los enlaces del estudio tipográfico.

---

## 1. Dirección de arte

**Concepto:** `Structured Intelligence / Verified Evidence`.

El lenguaje visual combina **modernismo suizo, diagramación editorial técnica y neo-brutalismo contenido**. Toda la interfaz se organiza en una retícula visible de módulos rectangulares. La identidad vigente combina lienzo azul noche muy oscuro dominante, paneles en azul institucional, verde de marca, acciones amarillas y texto blanco de gran escala.

### Principios no negociables

1. **La cuadrícula es arquitectura, no decoración:** las líneas separan regiones reales, alinean bloques y continúan entre secciones.
2. **Formas rectas:** contenedores, botones, tarjetas, campos, navegación y paneles usan esquinas cuadradas (`border-radius: 0`). El isotipo del cerebro conserva su forma orgánica propia.
3. **Tipografía protagonista:** títulos grandes, grotescos, precisos; microcopy técnico en monoespaciada.
4. **Geometría con significado:** arcos, círculos, sectores, líneas y checkpoints representan ciclos de captura, procesamiento y verificación.
5. **Color disciplinado:** azul, verde, blanco y amarillo son los únicos colores de identidad (paleta institucional, §2). Los neutros no se convierten en nuevos acentos; colores semánticos de error son una excepción funcional.
6. **Calma operacional:** evitar efectos de IA genéricos, neón, glassmorphism, difuminados, ilustraciones 3D y sombras profundas.
7. **Inspirarse sin clonar:** conservar la lógica de composición de Stellar Apex, pero crear figuras, navegación, secciones y layouts propios para GALCOA+.

### Palabras clave

`Geometric` · `Grid-based` · `Editorial` · `Technical` · `Trustworthy` · `Bold` · `Precise`.

---

## 2. Paleta cromática

> **Paleta institucional vigente (20/10/2026, [ExecPlan](docs/exec-plans/completed/paleta-institucional.md)).** Sustituye la paleta verde oscuro/amarillo anterior. Esta sección y `src/app/globals.css` definen los valores vigentes. **Dirección corregida por el usuario:** la interfaz es **azul noche muy oscuro dominante**, no clara ni azul medio plano; un borrador intermedio «predominantemente claro» quedó descartado. Referencias del usuario (sin copiar logos, textos ni layouts ajenos): lienzo navy casi negro con retícula azul/teal fina, titulares blancos, secundarios gris-azulados, CTA amarillo, cifras teal, paneles sin sombra y bloque verde `#176A57` junto a panel navy un tono más claro. Las referencias históricas de §12 no son instrucciones de implementación.

### Colores de identidad (exactos)

| Token | Valor | Rol |
|---|---|---|
| `--brand-blue` | `#1E3A5F` | Azul institucional base: paneles protagonistas (`.surface-inverse`), popovers, muted y activo de navegación. De él se deriva el lienzo |
| `--brand-green` | `#176A57` | Marca y botón/bloque secundario con texto blanco. No usar como texto sobre azul |
| `--brand-white` | `#F7F8F6` | Texto principal y titulares sobre azul. No es fondo masivo |
| `--brand-yellow` | `#FFDA47` | CTA principal (texto azul), foco y énfasis puntual |

### Tokens semánticos (azul noche por defecto)

| Token | Lienzo (`:root`) | Panel de marca `.surface-inverse` |
|---|---|---|
| `background` / `foreground` | **`#0C1A2E`** / `#F7F8F6` | `#1E3A5F` / `#F7F8F6` |
| `card`, `popover` | `#13263F`, `#1E3A5F` | `#27476F` |
| `primary` / `primary-foreground` | `#FFDA47` / `#1E3A5F` | igual |
| `secondary` / `-foreground` | `#176A57` / `#FFFFFF` | igual |
| `muted` / `muted-foreground` | `#1E3A5F` / `#B5C3D6` | `#27476F` / `#C9D4E2` |
| `accent` / `-foreground` | `#27476F` / `#F7F8F6` | `#35608F` / `#F7F8F6` |
| `destructive` | `#FFB3AD` | igual |
| `border` (divisor decorativo) | `#2B4566` | `#4B6A93` |
| `input` (límite de control) | `#8FA3BD` | `#9AADC6` |
| `ring` (foco) | `#FFDA47` | `#FFDA47` |
| `success` / `warning` | `#6FD0B2` / `#FFDA47` | `#8FDCC4` / `#FFDA47` |
| `sidebar*` | `#081423`, texto `#F7F8F6`, activo/borde `#1E3A5F`, primario/foco amarillo | — |

**Lienzo derivado:** `#0C1A2E` es el azul de marca `#1E3A5F` oscurecido; es una decisión de diseño a partir de las referencias del usuario, **sin medición de píxeles**: no se afirma correspondencia exacta de color con ellas. **Retícula y nodos (estáticos, sin animación):** líneas de 1px `rgb(111 170 190 / 0.14)` cada 96px, preservadas de la estética anterior; nodos teal `rgb(111 208 178 / 0.4)` de 3px en cada intersección y unos pocos amarillos `rgb(255 218 71 / 0.75)` de 4px (patrón de 6×5 celdas) como marcas de trazabilidad. Todo en el fondo del `body`: las superficies opacas lo cubren, así que no deben tapar la retícula sin necesidad. Los nodos son decorativos y nunca portan información.

**Superficies:** elevación sin sombras por tono: lienzo `#0C1A2E` → panel `#13263F` → azul de marca `#1E3A5F`. `.surface-inverse` crea un panel en `#1E3A5F` (hero, cabecera, bloque destacado) y re-mapea los tokens para que los hijos usen las mismas clases. `.surface-light` (`#F7F8F6`, texto `#1E3A5F`) es **excepción funcional** (p. ej. lienzo de QR o vista previa de documento), no un default. El verde de marca junto a navy o azul se separa con borde `border-input` o texto, no solo por tono. No hay selector de tema ni clase `.dark`.

**Proporción sugerida:** ~75% lienzo y paneles navy/azul, ~15% verde y neutros estructurales, ~10% amarillo puntual. Sin fondo blanco masivo.

### Reglas de contraste (calculadas, WCAG 2.x)

Fondos finales: lienzo `#0C1A2E`, panel `#13263F`, azul de marca `#1E3A5F`, acento `#27476F`.

- Blanco `#F7F8F6`: **16.39:1** sobre lienzo, **14.32:1** sobre panel, **10.80:1** sobre `#1E3A5F`, **8.89:1** sobre `#27476F`; sobre verde `#176A57` **6.09:1** (blanco puro **6.49:1**).
- `muted-foreground` `#B5C3D6`: **9.76:1** lienzo, **8.53:1** panel, **6.43:1** `#1E3A5F`, **5.30:1** `#27476F`. En panel de marca `#C9D4E2`: **7.22:1** sobre `#1E3A5F`.
- Amarillo `#FFDA47` como foco/énfasis: **12.78:1** lienzo, **11.17:1** panel, **8.42:1** `#1E3A5F`, **6.93:1** `#27476F`. CTA: azul `#1E3A5F` sobre amarillo **8.42:1**.
- `success` `#6FD0B2`: **9.43:1** lienzo, **8.24:1** panel, **6.21:1** `#1E3A5F`. `destructive` `#FFB3AD`: **10.23:1** lienzo, **8.94:1** panel, **6.74:1** `#1E3A5F`.
- `input` `#8FA3BD` (límite de control, ≥3:1): **6.77:1** lienzo, **5.91:1** panel, **4.46:1** `#1E3A5F`, **3.67:1** `#27476F`.
- **No usar** verde `#176A57` como texto: **2.69:1** sobre lienzo, **1.77:1** sobre `#1E3A5F`. El bloque verde sí vale como superficie con texto blanco (6.09:1).
- `border` decorativo (`#2B4566` 1.78:1 sobre lienzo, `#4B6A93` 2.07:1 sobre `#1E3A5F`) solo para divisores y retícula; nunca como único límite de un control ni de un estado.
- Excepción `.surface-light`: azul `#1E3A5F` sobre `#F7F8F6` **10.80:1**; amarillo sobre `#F7F8F6` **1.28:1** (prohibido allí).
- Errores: rojo semántico con texto o icono, nunca como único indicador. Controles deshabilitados (opacidad 50%) son la excepción de inactivos de WCAG, no un objetivo de diseño.

### Muestra visual de proporciones

```text
┌──────────────────────────────────────────────────────────┐
│ #0C1A2E  lienzo azul noche                              │
│                                                          │
│   #F7F8F6  TITULAR PRINCIPAL                             │
│                                                          │
│   ┌────────────────────┐  ┌──────────────────────────┐    │
│   │ #FFDA47           │  │ #176A57                 │    │
│   │ Acción principal   │  │ Bloque de marca          │    │
│   └────────────────────┘  └──────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```
---

## 3. Tipografía

> **Elección canónica aprobada:** las familias tipográficas para GALCOA+ son **Manrope** (sans principal variable) e **IBM Plex Mono** (monoespaciada técnica secundaria), ambas provistas y servidas localmente.

### Familia principal: Manrope

- Roles: titulares display, H1, H2, títulos de paneles/documentos, navegación, botones, inputs, párrafos, conversación del chat y estados generales de lectura.
- Pesos: `400` (cuerpo/lectura), `500` (labels y acciones secundarias), `600` (titulares, botones principales y énfasis), `700` (acentos puntuales).
- Titulares en blanco `#F7F8F6` sobre el lienzo azul noche y los paneles azules. Amarillo `#FFDA47` para CTA y acento de marca; solo como foco o texto sobre azul, nunca sobre la excepción clara.
- Texto de lectura: tracking neutro (`0`) y altura de línea descansada (`1.5–1.6`) para lectura sostenida sin fatiga visual.

### Familia secundaria: IBM Plex Mono

- Roles: metadatos técnicos específicos, identificadores opacos, hashes de huella y contenido, topics y números de secuencia HCS, referencias y valores tabulares que exijan alineación estricta de caracteres.
- Pesos: `400`, `500`, `600`.
- Uso acotado: **no** se utiliza para todos los subtítulos, estados o etiquetas de la interfaz. Se reserva estrictamente para información operacional verificable y referencias técnicas.

### Escala tipográfica por rol

| Rol | Escritorio | Móvil | Peso / interlínea / tracking |
|---|---|---|---|
| Hero landing | `clamp(2.5rem, 5.5vw, 5rem)` (64–80px) | `clamp(2.5rem, 11vw, 2.75rem)` (40–44px) | 600 / `1.02–1.08` / −.04em escr., −.03em móv. |
| H2 marketing | `2–2.5rem` (32–40px) | `1.625–1.875rem` (26–30px) | 600 / `1.15` / −.025em |
| H1 trabajo / confirmación | `1.75–2rem` (28–32px) | `1.5rem` (24px) | 600 / `1.2` / −.025em |
| Título secundario / panel | `1.25–1.5rem` (20–24px) | `1.25rem` (20px) | 600 / `1.3` / −.015em |
| Bajada landing | `1.125rem` (18px) | `1.0625rem` (17px) | 400 / `1.55` / 0 |
| Conversación, operación, campos | `1rem` (16px) | `1rem` (16px) | 400 / `1.6` / 0 |
| Acciones y labels | `0.875–1rem` (14–16px) | `1rem` (16px en campos/acciones) | 500–600 / `1.3–1.5` / 0 |
| Ayuda y metadatos no técnicos | `0.875rem` (14px) | `0.875rem` (14px) | 400–500 / `1.5` / 0 |
| Referencias, hashes, IDs (Mono) | `0.8125–0.875rem` (13–14px) | `0.8125–0.875rem` (13–14px) | 400–500 / `1.5` / 0 |

**Microtipografía y lectura:** tracking equilibrado (`letter-spacing: -0.04em` a `-0.025em` para titulares grandes y medianos, `0` para párrafos y lectura). Ajuste natural y balanceado de títulos sin saltos manuales forzados para un viewport arbitrario.

**Longitud ideal:** texto de lectura de 55–70 caracteres por línea en escritorio; en móvil se prioriza el aprovechamiento natural del ancho disponible sin provocar desbordes ni truncamientos innecesarios.

### Uso tipográfico por contexto

- **Landing:** jerarquía editorial expresiva, H1 dominante con titulares neutros, propuesta y llamada a la acción claras, espaciado estructurado en retícula.
- **Aplicación y Espacio de Trabajo:** títulos compactos neutros, jerarquía tranquila, conversación en Manrope de 16px con composer accesible, hashes y referencias técnicas en IBM Plex Mono.
- **Confirmación y Verificación:** marca mínima, lectura clara del acuerdo o documento antes de responder, nombres autodeclarados y estados explícitos.
- **Documentos exportados (PDF):** legibilidad y sobriedad formal prioritaria sobre fondo claro; no propaga automáticamente cambios de fuentes de la web y conserva su propia inmutabilidad visual y legal.

---

## 4. Retícula, medidas y geometría

### Retícula principal

- Máximo de contenido: `1440px`; valor recomendado estándar: `1360px`.
- Desktop: 12 columnas; gutters dentro de módulos `24–32px`; divisores de `1px`.
- Tablet: 8 columnas.
- Mobile: 4 columnas, márgenes de `16–20px`.
- La línea vertical del contenedor y las divisiones horizontales deben continuar de un bloque a otro cuando sirvan para organizar contenido.
- Layout basado en **módulos y bandas rectangulares**: paneles 1/2, 1/3, 2/3, paneles con ancho completo, separaciones por borde.
- No envolver cada grupo en una tarjeta. A menudo una línea divisoria y buen espaciado son suficientes.

### Sistema de espaciado

Base `4px`, con pasos principales de `8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`.

- Header desktop: `64–72px`.
- Secciones landing: `80–128px` verticales cuando no están formadas por bandas encadenadas.
- Interior de panel gráfico grande: `32–48px`; panel funcional: `20–32px`.
- Separación de controles: `8–16px`; de grupos de formulario: `24–32px`.
- Bordes: `1px` generalmente; `2px` solo cuando resalten un estado u objeto realmente prioritario.
- **Radio global:** `0px`; sin pastillas, squircles o cards blandas.

### Lenguaje geométrico original GALCOA+

La identidad tiene dos familias visuales compatibles:

**A. Geometría estructural**
- Rectángulos grandes divididos por retícula.
- Módulos amarillos o verdes que se detienen exactamente en una línea de columna.
- Franjas horizontales de progreso **solo cuando representen progreso real**.
- Marcas `+` o ticks, ampliadas como acento editorial puntual.

**B. Geometría de verificación**
- Arcos de `90° / 180° / 270°` con trazo monolineal, inscritos en celdas rectangulares.
- Círculos parciales concéntricos (no copiar órbitas ni la composición de Stellar Apex).
- Checkpoints conectados por líneas cortas, representando transiciones de estado reales.
- Cuadrados concéntricos / intersecciones: **información original → documento generado → validación**.
- Sectores rellenos de amarillo para momentos clave; trazo crema sobre verde para ilustración secundaria.

**Regla de unicidad:** una sección hero grande puede contener un sistema geométrico dominante; no repetir el mismo motivo a lo largo de toda la landing.

**Regla de producción:** crear geometría propia como SVG o CSS responsivo, no como screenshot incrustado. No usar emojis ni íconos genéricos de cerebro/cadena/escudo para fingir una identidad gráfica.

---

## 5. Composición de la landing

La captura de Stellar Apex aporta tres elementos útiles: **tipografía dominante, gran pieza geométrica y retícula editorial con acciones en bandas**. GALCOA+ los toma como lenguaje, no como plantilla idéntica.

### Header

- Fondo coherente con su contexto: lienzo azul noche o panel institucional `#1E3A5F` (`.surface-inverse`); nunca blanco masivo.
- Isotipo + wordmark real de GALCOA+ a la izquierda; no reconstruir el logo con CSS si existe SVG.
- Navegación centrada o alineada con la cuadrícula, links en celdas rectangulares.
- Acción a la derecha con bloque amarillo o verde.
- Separador inferior de `1px`; sin navbar tipo píldora ni efectos glass.
- Mobile: marca + control de menú; el menú abierto sigue usando bordes rectos y separación visible.

### Hero: dirección editorial asimétrica

```text
┌──────────────────────────────┬─────────────────────────┐
│ GALCOA+ / Identidad         │ Navegación / CTA        │
├──────────────────────────────┼─────────────────────────┤
│                              │                         │
│  EVIDENCIA                   │   ╭─────┐               │
│  QUE PODÉS                   │  ╱  ○   ╲              │
│  VERIFICAR.                  │ │  ✓     │  DIAGRAMA     │
│                              │  ╲_____╱               │
│                              │                         │
├──────────────────────────────┼─────────────────────────┤
│  Documentá acuerdos con IA.  │   [ CREAR DOCUMENTO → ] │
│  Revisá y conservá evidencia.│                         │
└──────────────────────────────┴─────────────────────────┘
```

**Texto de muestra editorial** (no contenido definitivo):

- Título: `EVIDENCIA QUE PODÉS VERIFICAR.`
- Bajada: `Documentá acuerdos con IA, revisá su consistencia y conservá evidencia trazable.`
- CTA: `Crear documento` si ese destino existe; de lo contrario, usar el destino real.

**Normas del hero:**
- Un título principal claro, máximo dos líneas en desktop cuando el largo de la copia lo permita; ajustar tamaño según ancho.
- Panel gráfico a la derecha con una composición geométrica auténtica para GALCOA+.
- Sección inicial y CTA visibles sin obligar a hacer scroll en un viewport de escritorio razonable.
- No introducir claims como `100% legal`, `a prueba de fraude`, `garantizado por blockchain` o certificaciones no demostradas.
- Priorizar colores de marca: figura amarilla sobre verde y geometría lineal crema.

### Secciones recomendadas (la distribución no constituye un PRD)

1. **Propuesta de valor:** héroe modular y geométrico.
2. **Cómo funciona:** captura de información → borrador asistido → control de consistencia → evidencia/trazabilidad. Cada etapa debe representar la implementación real.
3. **Vista del producto:** captura auténtica de una pantalla implementada, no maqueta inventada.
4. **Confianza y control:** explicar qué verifica el sistema, qué solicita al usuario y qué queda registrado, sin prometer funciones inexistentes.
5. **CTA de cierre:** banda amplia en verde, contraste amarillo, acción específica.
6. **Footer:** bloque estructurado, enlaces reales y textos legales cuando existan.

Alternar módulos para evitar que todas las secciones sean la misma retícula 50/50. Usar una composición en un tercio / dos tercios, otra a ancho completo y una de pequeñas divisiones alineadas.

---

## 6. Componentes de interfaz

### Botones

- Esquinas `0px`, sin sombras.
- Primario: fondo `#FFDA47` y texto `#1E3A5F`; hover sin perder contraste.
- Secundario: fondo `#176A57`, texto `#F7F8F6`; hover con borde/tono distinto.
- Terciario: texto crema + subrayado visible o borde; no depender solamente del color.
- Min-height `44px`; padding `12px 20px` o superior según densidad; foco visible de `2px` con separación.
- CTA textual coherente, sin mezclar múltiples sinónimos para la misma acción.

### Navegación

- Menús organizados en módulos rectangulares, y estado activo contrastado.
- No más de una línea de elementos en desktop.
- Panel desplegable rectangular, borde fino y navegación por teclado.

### Cards y paneles

- No usar card por defecto: preferir módulos de retícula separados por un único borde.
- Si hay panel, tono azul elevado (`card` o `.surface-inverse`) según jerarquía, sin sombra, padding `24–32px`, esquinas cuadradas.
- Hover sutil mediante cambio de fondo o borde, no elevación 3D.

### Inputs, selects, textareas y checkboxes

- Labels por encima de los campos; hints y errores por debajo.
- Campos rectangulares: `background: #18221C`, borde `#35443C`, texto crema, altura mínima `44px`.
- Focus: borde amarillo + contorno adicional perceptible.
- `placeholder` secundario legible, sin reemplazar el label.
- Iconografía de estados solo cuando aporte significado; acompañar estados con palabras claras.
- Checkbox cuadrado; checked amarillo con check verde.

### Tabs, tablas y revisiones de documentos

- Tabs rectangulares con borde inferior/área marcada para seleccionado.
- Tablas: filas de altura suficiente, bordes horizontales útiles, cabeceras fijas cuando corresponda, valores numéricos con fuente monoespaciada.
- Código, identificadores, huellas y hashes: monoespaciados, truncado explícito con acceso al valor completo y botón Copiar.
- Las discrepancias detectadas por IA se muestran junto al fragmento o campo afectado, con sugerencias y acciones claras. No marcar todo como verificado por decoración.
- Estados: `En revisión`, `Verificado`, `Requiere atención`, `Error`; usar texto + icono/forma, nunca color únicamente. En documentos, el estado debe reflejar hechos reales del sistema.

### Componentes de geometría reutilizables

- `GridSection`: módulo grande con líneas estructurales.
- `GeometricVisual`: área SVG adaptable con variantes `arc`, `segments`, `intersection`, `checkpoint`.
- `ProcessStep`: bloque rectangular de una etapa real, indicador y descripción.
- `EvidenceState`: insignia accesible de estado con texto, no punto decorativo.
- `TechnicalLabel`: IBM Plex Mono y contraste garantizado.

Los nombres son **sugerencias de arquitectura**, no una exigencia de API o biblioteca existente.

---

## 7. Motion y comportamiento

La identidad se siente precisa, no hiperactiva.

- Entradas puntuales por opacidad y `translateY(12px)` en elementos editoriales.
- Duraciones sugeridas: `180–300ms`; easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- Botones y controles responden al hover/focus/pressed; transformaciones de `1–2px` máximo.
- Una animación hero opcional puede dibujar un arco y cerrar un check **como metáfora del proceso de verificación**.
- Barras o nodos de progreso solo en procesos de verdad, no en loop que sugiera actividad inexistente.
- No usar efectos globales de cursor, parallax intenso, glitch, líneas infinitas, neón o loaders ornamentales.
- Respetar `prefers-reduced-motion`; eliminar transiciones espaciales y loops para quienes reduzcan movimiento.

---

## 8. Responsive

| Viewport | Sistema | Adaptación |
|---|---|---|
| ≥ 1280px | 12 columnas | Hero 7/5 o 6/6, ancho contenido limitado |
| 768–1279px | 8 columnas | Hero 4/4 o apilado según espacio real |
| < 768px | 4 columnas | Secciones a una columna; gráfica debajo del titular; menú colapsable |
| ≤ 375px | 4 columnas | Padding lateral 16px, títulos escalados, sin overflow |

- Mantener las líneas de retícula que separan contenido; quitar líneas huérfanas o con propósito meramente ornamental.
- Recortar o reorganizar arcos dentro de su celda, nunca usar una imagen gigante que desborde.
- No esconder CTA principal ni texto crítico detrás de la geometría.
- Objetivos táctiles de `44×44px` como mínimo.
- Una tabla extensa puede tener scroll horizontal accesible, una alternativa apilada o una vista de detalle.
- Evitar fijar `height: 100vh` en mobile; preferir `min-height: 100dvh` cuando corresponda.

---

## 9. Tokens CSS de referencia

```css
:root {
  /* Paleta institucional vigente; valores completos en §2 y globals.css */
  --brand-blue: #1e3a5f;
  --brand-green: #176a57;
  --brand-white: #f7f8f6;
  --brand-yellow: #ffda47;

  --bg: #0c1a2e;
  --surface: #13263f;
  --surface-deep: #1e3a5f;
  --line: #2b4566;
  --text: #f7f8f6;
  --text-muted: #b5c3d6;
  --paper: #f7f8f6; /* solo excepción clara (QR, vista previa) */

  --font-display: "Manrope", sans-serif;
  --font-body: "Manrope", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;

  --radius: 0px;
  --border: 1px solid var(--line);
  --container: 1360px;
  --gutter: clamp(16px, 3vw, 32px);

  --motion-fast: 180ms;
  --motion-normal: 260ms;
  --motion-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Ejemplos de uso, no reemplazan los componentes reales de la app */
.design-shell {
  width: min(calc(100% - 2 * var(--gutter)), var(--container));
  margin-inline: auto;
  border-inline: var(--border);
}
.design-panel {
  border-bottom: var(--border);
  border-radius: var(--radius);
}
.design-display {
  font-family: var(--font-display);
  font-size: clamp(2.8rem, 8vw, 8rem);
  font-weight: 600;
  line-height: .96;
  letter-spacing: -.055em;
}
.design-cta {
  min-height: 44px;
  padding: 12px 20px;
  border-radius: 0;
  background: var(--brand-yellow);
  color: var(--brand-blue);
  font-family: var(--font-display);
  font-weight: 600;
}
.design-cta:focus-visible {
  outline: 2px solid var(--paper);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

**Implementación de fuentes:** si el proyecto usa Next.js, preferir `next/font/google` o autoalojamiento. No depender de `@import` de Google Fonts en CSS de producción. Asegurarse de que los nombres coincidan con las familias realmente cargadas.

---

## 10. Antipatrones y límites

**NO:**

- Radios grandes (`rounded-xl`, `rounded-2xl`), botones píldora o componentes shadcn sin adaptar.
- Tarjetas blancas con sombras genéricas.
- Gradientes púrpura/azul y destellos de IA.
- Círculos o crosshairs repetidos sin vínculo con datos o estructuras.
- Cerebros/circuitos extra decorativos: el cerebro existente es **la marca**, no una textura que se repite.
- Emojis en la interfaz visual, claims no verificables ni números simulados presentados como reales.
- Hero entero centrado con un blob atrás, salvo una excepción justificada por contenido.
- Tabla de documentos estilizada como cartel publicitario: la aplicación es una herramienta y exige densidad y claridad.
- Recrear el arte orbital de Stellar Apex pixel a pixel; se toma el principio geométrico, no su ilustración específica.

**SÍ:** retícula editorial nítida, jerarquía tipográfica, bloques de color grandes, geometría propia de trazabilidad, contraste WCAG AA, interfaces accesibles y prioridad a tareas reales.

---

## 11. Checklist de aceptación visual

- [ ] Logo SVG existente respetado, variantes horizontal/isotipo y uso correcto de `+` amarillo.
- [ ] Azul `#1E3A5F`, verde `#176A57`, blanco `#F7F8F6` y amarillo `#FFDA47` con los roles y contrastes de §2.
- [ ] Tipografía Manrope + IBM Plex Mono cargada localmente y aplicada por roles.
- [ ] Componentes de interacción rectangulares; esquinas `0px`.
- [ ] Landing con retícula real y divisiones alineadas entre secciones.
- [ ] Figura hero propia, vinculada a verificación o trazabilidad.
- [ ] CTA visible, nombres coherentes y destinos funcionales.
- [ ] Contraste verificable en textos, botones, placeholders y focus.
- [ ] Responsive a 320px, 375px, 768px, 1024px y 1440px sin overflow.
- [ ] Navegación por teclado, `focus-visible` y reduced motion funcionando.
- [ ] Estado loading, empty, success y error diseñados para acciones relevantes.
- [ ] La aplicación no sacrifica legibilidad ni utilidad por imitar el hero publicitario.
- [ ] No se incorporan promesas de certificación, garantías legales ni funcionalidades que el PRD/código no respalden.

---

## 12. Referencia y trazabilidad de decisiones

- **Observado en la captura proporcionada:** fondo muy oscuro, líneas finas de retícula, áreas modulares cuadrangulares, un enorme título sans-serif, copy monoespaciado, bloques de color de gran área, gran motivo circular parcial y CTA rectangular.
- **Corroborado en el sitio:** la página de Stellar Apex exhibe una jerarquía landing con propuesta de valor, llamados a la acción y contenido por secciones. [Sitio](https://stellarapex.org/).
- **Propuesto específicamente para GALCOA+:** todas las fuentes nombradas, los tonos neutros, la escala, los tokens CSS, los usos de geometría como metáfora de verificación, el copy de ejemplo y los patrones de aplicación.
- **Referencia inicial histórica:** verde `#174235` y amarillo `#FCD34D`, isotipo cerebro + check e intención rectangular. La paleta posterior aportada por el usuario sustituye esos colores por los valores vigentes de §2; se conserva la geometría.

**Objetivo final:** que GALCOA+ tenga una identidad inequívoca y reutilizable, inspirada en la fuerza visual de Stellar Apex pero diseñada alrededor del producto y su marca propios.

---

## 13. Propuesta tipográfica y dirección de evolución — pendiente de aprobación

**20/10/2026 · Dirección aprobada: Manrope + IBM Plex Mono.** La aprobación posterior al estudio autoriza implementarla según el [ExecPlan UI/UX](docs/exec-plans/completed/ui-ux-profesional.md), comenzando por estabilización funcional. La comparación por sí sola no modificó componentes, estilos, fuentes ni configuración productivos. Corresponde al paso 2 solicitado por el usuario, equivalente a la **etapa 1** del ExecPlan, no a su etapa 2 de componentes.

### Lectura de diseño

- **Producto y público:** documentar operaciones relatadas por un autor y permitir que terceros lean y respondan sobre una revisión. La lectura importa más que expresar una estética de IA.
- **Carácter:** precisión editorial con calma operacional. Evolución de la identidad, no reemplazo de marca.
- **Densidad:** landing expresiva; chat compacto con texto aireado; confirmación lineal y sin distracciones comerciales.
- **Composición:** retícula de regiones reales, titulares neutros y una acción dominante. Verde identifica superficies; amarillo señala acción o foco, no todos los encabezados.
- **Restricciones vigentes:** paleta institucional de §2, esquinas rectas, mismos recorridos y términos del PRD. Ni el diseño ni sus ilustraciones atribuyen verdad o identidad comprobadas.

### Comparación y decisión propuesta

Mismo contenido español, contenedores, tamaños, pesos y estados para ambas parejas. Se renderizaron tres superficies aisladas a 1440, 768, 390 y 320 px. Se inspeccionaron las doce capturas de 1440/390; las otras medidas tienen comprobación geométrica automatizada, no revisión visual completa. [Prototipo, capturas, métricas y reproducción](docs/design-experiments/typography-2026-10-20/README.md).

| Superficie | Space Grotesk + IBM Plex Mono | Manrope + IBM Plex Mono | Lectura de diseño |
| --- | --- | --- | --- |
| Landing | Carácter técnico más marcado, con formas y ritmo próximos a la mono. El titular conserva presencia | Contorno más sobrio y compacto; conserva presencia con peso 600 | Manrope deja que retícula, color y escala construyan la identidad sin duplicar el tono técnico en todo el texto |
| Chat | Legible, aunque la personalidad de cada letra permanece visible en lectura sostenida | Párrafo visualmente más continuo; mejor separación de rol frente a referencias mono | Preferir Manrope para conversación y controles; esto es juicio visual, no una prueba de velocidad lectora |
| Confirmación | Mayor expansión de algunos textos auxiliares; párrafo de muestra de 4 líneas a 1440 px | Párrafo de muestra de 3 líneas a 1440 px; a 390 px ambas usan 7 | Preferir Manrope por tono sobrio y economía en este contenido, no porque siempre ocupe menos |

Con estos estilos, ambas producen titulares landing de 3 líneas a 1440/390 px y 4 a 320. A 320 px el mensaje de autor ocupa 9 líneas con Space y 8 con Manrope; el cuerpo de operación, 10 y 9. Son medidas de esta muestra, no ventajas universales. Ambas muestran acentos, ñ, nombres largos, fechas, cantidades e importes sin desborde horizontal en las 24 vistas. CDP identifica fuentes web efectivamente utilizadas; no se decidió a partir de un fallback.

**Alternativas descartadas en esta propuesta:** mantener Space es viable y evita una migración, pero prioriza carácter técnico donde ahora se busca lectura más tranquila. Combinar Space para display y Manrope para cuerpo agregaría una tercera familia junto a IBM Plex Mono sin una necesidad suficiente. No cambiar la tipografía de PDFs ni el arte del logo al cambiar la web.

### Sistema propuesto por rol

La escala siguiente es exclusiva de esta propuesta; no convierte las escalas históricas de §3 en cambios aprobados. Valores en px como referencia a raíz de 16 px; expresar la implementación futura en unidades relativas y conservar zoom.

| Rol | Escritorio | Móvil | Peso / interlínea / tracking |
| --- | --- | --- | --- |
| Hero landing | 64–80; muestra 80 a 1440 | 40–44; muestra 44 a 390/320 | 600 / 1.02–1.08 / −.04em escritorio, −.03em móvil |
| H2 marketing | 32–40 | 26–30 | 600 / 1.15 / −.025em |
| H1 de trabajo o confirmación | 28–32 | 24 | 600 / 1.2 / −.025em |
| Título de panel/documento secundario | 20–24 | 20 | 600 / 1.3 / −.015em |
| Bajada landing | 18 | 17 | 400 / 1.55 / 0 |
| Conversación, operación, campos | 16 | 16 | 400 / 1.6 / 0 |
| Acciones y labels | 14–16 | 16 en campos/acciones principales | 500–600 / 1.3–1.5 / 0 |
| Ayuda y metadatos no técnicos | 14 | 14 | 400–500 / 1.5 / 0 |
| Referencias, hashes, IDs | IBM Plex Mono 13–14 | 13–14 | 400–500 / 1.5 / 0 |

Sans principal en titulares, párrafos, estados, nombres y navegación. Mono **no** para todos los subtítulos, estados o etiquetas como sugería §3: reservarla a identificadores, huellas y referencias cuya comparación exacta lo justifique. Números de tablas pueden usar cifras tabulares de la sans; importes en prosa no necesitan cambiar de familia. Peso 700 solo puntual. No uppercase sistemático ni tracking negativo en párrafos. Lectura de 55–70 caracteres aproximadamente; no perseguir un número fijo a costa de estrechar móvil. Usar ajuste natural/balanceado de títulos, no saltos manuales para un único viewport.

### Color, superficies y composición propuestos

La dirección tipográfica se conserva y el color se rige por §2: lienzo azul noche, paneles azules, verde de identidad y amarillo de acción. Encabezados blancos sobre azul; no titulares amarillos sistemáticos. Bordes estructurales no sustituyen la indicación contrastada de campos, selección o foco. Foco contrastado con separación, nunca solo cambio de tono. Reutilizar los tokens semánticos y `.surface-inverse`; no introducir una paleta paralela por pantalla.

- **Landing:** hero 7/5 en escritorio, propuesta y CTA a izquierda, explicación de etapas a derecha. La idea memorable es la transformación conversación → revisión → confirmaciones en regiones alineadas, no una órbita decorativa ni tres cards intercambiables. El diagrama es explicativo, no barra de avance real ni screenshot del producto. El prototipo no representa la landing completa.
- **Chat:** título compacto, estado subordinado, conversación central hasta unos 720 px y composer cercano al hilo. Distinguir autor y asistente con etiqueta además de superficie. Evitar tarjetas dentro de tarjetas y tipografía de hero. El resumen conserva acceso sin crear un panel fijo que comprima la lectura móvil; su navegación final depende del recorrido real auditado.
- **Confirmación:** marca mínima, acción explicada, operación completa antes de respuesta, nombre autodeclarado y casilla inicialmente vacía. No esconder snapshot/advertencias para hacer entrar botones en el primer viewport. Casilla y acciones se rigen por el servidor/contrato existente; rechazo mantiene modal de ratificación. El prototipo solo representa la composición tipográfica inicial, no estos comportamientos.
- **Medidas:** conservar límite general de §4 (1360 px como referencia); el estudio usa 1280 para marketing, 1060 para chat y 760 para confirmación como contenedores de comparación, no sustitución global aprobada. Ritmo base 4/8 px; separación 16–24 en lectura y 24–32 entre grupos. Controles principales con área objetivo de 44 px o mayor. Radio 0, sin sombras, texturas nuevas ni glass.
- **Assets:** reutilizar logo SVG real y capturas auténticas cuando correspondan. El estudio usa texto de marca solo como referencia de posición y no aprueba redibujar el logo. No requiere fotos, avatares, testimonios, cifras comerciales ni iconografía nueva.

### Responsive y estados

| Ancho | Intención |
| --- | --- |
| ≥1280 | Retícula editorial 7/5 en landing; hilo limitado y confirmación centrada. No estirar párrafos para llenar pantalla |
| 768–1279 | Mantener dos regiones solo si título y CTA respiran; el estudio apila hero hasta 900 y distribuye etapas en una fila. El breakpoint final responde al contenido, no al nombre de dispositivo |
| 390/360 | Una columna; CTA antes del diagrama; etapas verticales, sin carrusel. Chat sin lateral fijo. Confirmación conserva el orden operación → respuesta y apila acciones |
| 320 y zoom | Márgenes de 16; permitir títulos multilínea. No truncar títulos de operación ni ocultar instrucciones. Referencias largas con quiebre controlado; valor íntegro accesible al copiar/ver |

Estado normal legible; hover solo en puntero fino; foco inmediato visible; pressed inequívoco; disabled con razón disponible; carga con texto de fase real; vacío orientado a comenzar; error técnico con reintento y borrador conservado; éxito solo después de respuesta real. No cambiar silenciosamente `DEMO_HIDE_WARNINGS`, inventar progreso ni tratar advertencias como impedimentos. Los estados finales, error, carga y modal no están cubiertos por las capturas tipográficas.

### Intención de movimiento propuesta, no implementada

| Elemento | Propósito / disparador | Tratamiento y movimiento reducido |
| --- | --- | --- |
| Botón, copia | Responder a pulsación/resultado real | Feedback inmediato; puntero puede comprimir a .98 en 100–140 ms. Sin transformación en teclado o reduced motion; foco sin animación |
| Modal de ratificación | Separar una decisión irreversible al abrir | Entrada de opacidad y escala .98→1, 180–220 ms, origen centrado; salida 120–160 ms. Reduced motion: sin escala, opacidad breve o inmediata |
| Popover/panel existente | Mostrar relación con el control que lo abre | Opacidad/transform desde su anclaje; 150–200 ms, sin rebote. Reduced motion sin desplazamiento; no agregar paneles por poder animarlos |
| Conversación / espera | Distinguir mensaje confirmado y fase real | Texto disponible de inmediato; no stagger por mensaje/token, no mover lo ya leído, no scroll forzado. Mensaje de espera textual solo durante trabajo real |
| Hero | Explicar el recorrido, si una animación aporta algo | Preferencia inicial estática. Una entrada opcional de opacidad ≤200 ms, una sola vez, sin ocultar CTA ni bloquear lectura; reduced motion estático |

Curva de entrada propuesta `cubic-bezier(.23,1,.32,1)`; transiciones interrumpibles de propiedades explícitas, nunca `all`. Priorizar transform/opacity, sin librería nueva. Acciones frecuentes y navegación por teclado no esperan animaciones. No confundir un check animado con operación confirmada, finalizada o sellada.

**Decisiones implementadas ([plan `movimiento-profesional`](docs/exec-plans/completed/movimiento-profesional.md); sustituyen a la «preferencia estática» del hero):**

- Tokens y utilidades en `globals.css`: `--motion-press` 140 ms, `--motion-ui` 200 ms, `--motion-exit` 140 ms, `--motion-ease-out` `cubic-bezier(.23,1,.32,1)`; `.motion-enter` (opacidad + 8 px, `backwards` para que el contenido sea visible sin animación), `.motion-fade` (solo opacidad) y `.motion-reveal`.
- Hero: selector del recorrido (hover de mouse, clic/toque y teclado) con una ilustración rotulada «Ejemplo ilustrativo · no es un documento real». No hay autoplay; seleccionar no mueve controles ni roba foco. El h1 no se anima (LCP).
- Navegación: `template.tsx` en `(app)` y `(auth)` anima solo el contenido nuevo; encabezado y aside permanecen. Revelado de scroll único vía `Reveal`: HTML visible, solo se oculta tras hidratar lo que está bajo el viewport (con `rootMargin: "0px"`); sin observer, sin JS o al imprimir queda visible.
- Aplicación: entrada de mensajes propios nuevos (no historial ni respuestas del asistente, para no parpadear con el streaming; baseline perezoso tras carga inicial), tarjetas del dashboard (escalonado ≤150 ms; solo «Abrir» es accionable), alertas de resultado/error y distintivos de estado reales. «Copiado» vuelve a reposo a los 2 s con limpieza del temporizador.
- Movimiento reducido: sin desplazamiento ni escala; se conservan opacidad y color.

### Evidencia, aceptación y pendientes

- **Comprobado en el estudio:** 24 combinaciones sin desborde horizontal, 12 PNG revisados, familias web identificadas por CDP, archivos WOFF2 locales y casilla vacía. Capturas equivalentes, sin sesión ni llamadas de negocio. El Chromium headless fue independiente y se cerró; no se utilizó el navegador compartido.
- **Límites:** contenido y marca textual de demostración; no es captura de producción, ni test de componentes reales, ni prueba de lectura con usuarios. No acredita AA global, teclado, zoom 200%, Safari, dispositivos físicos, rendimiento de carga, fallback/CLS de Next ni motion. No se ejecutaron suites productivas porque no cambió código productivo.
- **Criterios para la eventual integración:** familias efectivas coincidentes entre preview y Next; lectura sin recortes a 320/390/768/1440 y zoom 200%; foco/contraste y estados reales comprobados; mismas revisiones, confirmaciones y permisos del PRD; nada de tipografía web propagada a PDF inmutable. Son criterios de diseño, no autorización ni plan de ejecución.
- **Decisión posterior:** el usuario aprobó la pareja Manrope + IBM Plex Mono y esta dirección/jerarquía, junto con estabilización previa. Sigue pendiente implementar y validar las pantallas reales; el prototipo no acredita ese resultado. El recorrido productivo del paso 1 está registrado en el ExecPlan, no en esta evidencia tipográfica.

# GALCOA+ · DESIGN.md

> **Estado:** propuesta de dirección visual, lista para implementar y ajustar mediante revisión de pantallas reales.  
> **Producto:** GALCOA+, plataforma de documentación asistida por IA, verificación de consistencia y trazabilidad de evidencia.  
> **Referencia visual:** [Stellar Apex](https://stellarapex.org/) y captura proporcionada (17/10/2026).  
> **Alcance:** marketing/landing y criterios de adaptación a la aplicación. Este archivo define **cómo se ve y se comporta visualmente** el producto; no reemplaza su PRD ni determina capacidades legales o técnicas.

---

## 1. Dirección de arte

**Concepto:** `Structured Intelligence / Verified Evidence`.

El lenguaje visual combina **modernismo suizo, diagramación editorial técnica y neo-brutalismo contenido**. Toda la interfaz se organiza en una retícula visible de módulos rectangulares. La identidad se construye con un contraste marcado entre fondo oscuro, superficies verdes, acentos amarillos y texto de gran escala.

### Principios no negociables

1. **La cuadrícula es arquitectura, no decoración:** las líneas separan regiones reales, alinean bloques y continúan entre secciones.
2. **Formas rectas:** contenedores, botones, tarjetas, campos, navegación y paneles usan esquinas cuadradas (`border-radius: 0`). El isotipo del cerebro conserva su forma orgánica propia.
3. **Tipografía protagonista:** títulos grandes, grotescos, precisos; microcopy técnico en monoespaciada.
4. **Geometría con significado:** arcos, círculos, sectores, líneas y checkpoints representan ciclos de captura, procesamiento y verificación.
5. **Color disciplinado:** verde y amarillo son los únicos colores de identidad. Los neutros no se convierten en nuevos acentos; colores semánticos de error son una excepción funcional.
6. **Calma operacional:** evitar efectos de IA genéricos, neón, glassmorphism, difuminados, ilustraciones 3D y sombras profundas.
7. **Inspirarse sin clonar:** conservar la lógica de composición de Stellar Apex, pero crear figuras, navegación, secciones y layouts propios para GALCOA+.

### Palabras clave

`Geometric` · `Grid-based` · `Editorial` · `Technical` · `Trustworthy` · `Bold` · `Precise`.

---

## 2. Paleta cromática

### Colores de identidad (fijos)

| Token | Valor | Uso |
|---|---|---|
| `--brand-green` | `#174235` | Logotipo, paneles de marca, bloques destacados, botones secundarios sobre fondo claro |
| `--brand-yellow` | `#FCD34D` | Check del isotipo, símbolo `+`, CTA principal, números clave, focos geométricos |

### Neutros de interfaz (propuestos)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#101411` | Fondo principal, oscuridad verdosa en vez de negro puro |
| `--surface` | `#18221C` | Paneles elevados por contraste de fondo, sin sombra |
| `--surface-deep` | `#0D110F` | Zonas de alto contraste y módulos técnicos |
| `--line` | `#35443C` | Retícula, bordes y divisores estructurales |
| `--text` | `#F5F4EC` | Texto primario y títulos neutros |
| `--text-muted` | `#B9C6BD` | Texto secundario legible |
| `--paper` | `#F5F4EC` | Fondos claros ocasionales, ilustraciones geométricas y exportables |

**Proporción sugerida de una página oscura:** 70% fondos oscuros, 20% verde y neutros estructurales, 10% amarillo. No es una cuota exacta: el amarillo debe destacar por contraste, no llenar cada bloque.

### Reglas de contraste

- Amarillo `#FCD34D` sobre verde `#174235`: **7.80:1**.
- Crema `#F5F4EC` sobre verde `#174235`: **10.19:1**.
- Crema `#F5F4EC` sobre fondo `#101411`: **16.84:1**.
- **No usar texto verde `#174235` sobre fondo oscuro `#101411`**: el contraste es ~**1.65:1**, insuficiente.
- **No usar texto amarillo sobre fondo crema**: contraste ~**1.31:1**, insuficiente.
- CTA amarillo: texto verde. CTA verde: texto crema o amarillo. El contraste debe pasar WCAG AA.
- Estados críticos de error pueden introducir un rojo semántico accesible, pero nunca como color publicitario de marca ni como único indicador de error.

### Muestra visual de proporciones

```text
┌──────────────────────────────────────────────────────────┐
│ #101411  fondo oscuro                                   │
│                                                          │
│   #F5F4EC  TITULAR PRINCIPAL                             │
│                                                          │
│   ┌────────────────────┐  ┌──────────────────────────┐    │
│   │ #FCD34D           │  │ #174235                 │    │
│   │ Acción principal   │  │ Área gráfica            │    │
│   └────────────────────┘  └──────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Tipografía

> **Importante:** las familias siguientes son **elecciones para GALCOA+**, no una afirmación sobre las fuentes exactas usadas por Stellar Apex.

### Familia principal: Space Grotesk

- Roles: titulares, navegación, botones, texto general y números destacados.
- Pesos: `400`, `500`, `600`, `700`.
- Mayúsculas para lemas cortos, etiquetas principales o wordmark según el logo definitivo.
- Titulares: tracking cerrado y line-height compacto.
- Texto de lectura: tracking normal y altura de línea más abierta.

### Familia secundaria: IBM Plex Mono

- Roles: subtítulos técnicos, etiquetas, numeraciones que **sí** describen etapas reales, metadatos, tablas, hashes truncados, estados y captions.
- Pesos: `400`, `500`, `600`.
- Puede usarse en uppercase con tracking de `0.02em–0.05em` para microetiquetas.
- No usar monoespaciada para párrafos largos en la app: reservarla para información operacional.

### Escala tipográfica sugerida

| Elemento | Desktop | Mobile | Peso / interlínea |
|---|---|---|---|
| Hero display | `clamp(4rem, 8vw, 8rem)` | `clamp(2.8rem, 12vw, 4.6rem)` | 500–600 / `0.92–1.00` |
| H1 página | `clamp(3rem, 5.5vw, 5.5rem)` | `2.5–3.25rem` | 500–600 / `0.98–1.05` |
| H2 sección | `clamp(2.25rem, 4vw, 4rem)` | `2–2.5rem` | 500–600 / `1.0–1.08` |
| H3 | `1.4–1.75rem` | `1.25–1.5rem` | 600 / `1.15` |
| Lead | `1.125–1.3rem` | `1.0625rem` | 400 / `1.45` |
| Body | `1rem` | `1rem` | 400 / `1.5–1.65` |
| UI / botón | `0.875–1rem` | `0.875–1rem` | 500–600 / `1.2` |
| Mono label | `0.75–0.875rem` | `0.75rem` | 500 / `1.35` |

**Microtipografía:** `letter-spacing: -0.055em` para display grande, `-0.025em` para encabezados medianos, `0` para párrafos; encabezados no deben quedar cortados, con viudas de una palabra ni desbordarse.

**Longitud ideal:** texto de lectura de 55–70 caracteres por línea; microcopy técnico corto y suficientemente contrastado.

### Uso tipográfico por contexto

- **Landing:** jerarquía expresiva, H1 enorme, títulos con pocas palabras, grandes espacios entre módulos.
- **Aplicación:** títulos compactos, jerarquía estable, muchos datos sin competir con la tipografía de display.
- **Documentos exportados:** legibilidad y formalidad prioritaria; no forzar estilo gigante, fondos oscuros ni tintas amarillas que afecten impresión.

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

- Fondo oscuro que continúa con el lienzo.
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
- Primario: fondo `#FCD34D` y texto `#174235`; hover oscurecer ligeramente el fondo sin perder contraste.
- Secundario: fondo `#174235`, texto `#F5F4EC`; hover con borde/tono distinto.
- Terciario: texto crema + subrayado visible o borde; no depender solamente del color.
- Min-height `44px`; padding `12px 20px` o superior según densidad; foco visible de `2px` con separación.
- CTA textual coherente, sin mezclar múltiples sinónimos para la misma acción.

### Navegación

- Menús organizados en módulos rectangulares, y estado activo contrastado.
- No más de una línea de elementos en desktop.
- Panel desplegable rectangular, borde fino y navegación por teclado.

### Cards y paneles

- No usar card por defecto: preferir módulos de retícula separados por un único borde.
- Si hay panel, superficie oscura/verde, padding `24–32px`, esquinas cuadradas.
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
  --brand-green: #174235;
  --brand-yellow: #fcd34d;

  --bg: #101411;
  --surface: #18221c;
  --surface-deep: #0d110f;
  --line: #35443c;
  --text: #f5f4ec;
  --text-muted: #b9c6bd;
  --paper: #f5f4ec;

  --font-display: "Space Grotesk", sans-serif;
  --font-body: "Space Grotesk", sans-serif;
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
  color: var(--brand-green);
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
- [ ] Solo verde `#174235` y amarillo `#FCD34D` como acentos de marca.
- [ ] Tipografía Space Grotesk + IBM Plex Mono cargada y aplicada por roles.
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
- **Del usuario, sin modificaciones:** los colores de marca `#174235` y `#FCD34D`; el isotipo cerebro + check; la intención de una interfaz rectangular y geométrica.

**Objetivo final:** que GALCOA+ tenga una identidad inequívoca y reutilizable, inspirada en la fuerza visual de Stellar Apex pero diseñada alrededor del producto y su marca propios.

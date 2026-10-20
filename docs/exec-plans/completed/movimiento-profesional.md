# ExecPlan — Movimiento profesional de GALCOA+

Estado: COMPLETADO — cerrado el 2026-10-20 tras revisión independiente PASS y reconciliación documental.
Fecha: 2026-10-20.
Origen: pedido directo del usuario y aprobación posterior a auditoría de solo lectura.

## Objetivo y alcance

Dar continuidad, jerarquía y respuesta a la interfaz existente sin rediseñarla ni demorar las tareas. Landing expresiva con un hero interactivo como momento protagonista; aplicación sobria con entradas breves y feedback contextual.

Incluye hero, entradas al navegar, revelado selectivo al hacer scroll, dashboard, mensajes nuevos del chat, revisión/confirmación, resultados y copia. No incluye smart contracts, cambios de producto/backend/Auth, migraciones, llamadas reales a proveedores, entrega Git ni despliegue.

## Referencias y punto de partida

- Identidad y movimiento: [design.md](../../../design.md).
- Producto: [PRD](../GALCOA-PRD-v1.4.md), invariantes de confirmaciones, privacidad e inmutabilidad; ninguna animación implica confirmación o registro antes de una respuesta real.
- Arquitectura y checks: [architecture.md](../../architecture.md), [development.md](../../development.md).
- Antecedente completado: [UI/UX profesional](ui-ux-profesional.md). No repetir su trabajo ni atribuir sus tests a esta nueva implementación.
- Auditoría: explorador `ses_ea7b7f2f8ffeL5yiyFsiS7cD7V`. Identificó hero inerte, tokens de movimiento dispersos, modales/botones ya animados, aparición abrupta de estados y copia sin retorno a reposo. Las recomendaciones son hipótesis de implementación que se verificarán contra código y navegador.
- El árbol ya contiene muchos cambios locales del trabajo anterior, incluso en los archivos de este alcance. Preservarlos; revisar diferencias incrementales sin revertir ni reformatear trabajo ajeno. `recordings/` no se publica en bloque.

## Dirección y restricciones

- Conservar Manrope/IBM Plex Mono, oscuro/verde/amarillo y geometría recta.
- Un gesto distintivo: el hero explica documentar → confirmar → registrar una huella. Mantener explícita la revisión; no borrar etapas reales por resumir la presentación en tres momentos.
- Sin autoplay, parallax, rebotes, loops decorativos ni progreso simulado. Indicadores de espera reales pueden continuar mientras exista la operación.
- Movimiento principalmente mediante transform y opacidad. Respuesta orientativa de 120–160 ms y transiciones de interfaz de 180–250 ms, con salida rápida y curvas compartidas; afinar visualmente, no por números aislados.
- Teclado inmediato y foco visible, selección por toque, hover solo con puntero adecuado. Movimiento reducido elimina desplazamiento decorativo y conserva claridad de estado.
- Contenido accesible sin animación ni JavaScript de revelado; no introducir parpadeos de hidratación, saltos de layout ni espera obligatoria al navegar.
- No remounts globales que reinicien formularios, conexiones o chat; no reanimar historial o tokens de streaming ni forzar scroll por cada actualización.
- Reutilizar CSS, Base UI y herramientas instaladas. Sin dependencias nuevas inicialmente. Leer guías locales de Next antes de modificar código Next y consultar documentación pertinente a las APIs utilizadas.

## Ejecución

### 1. Confirmar puntos de integración y contrato de movimiento

- [x] Revalidar auditoría y estado local; inspeccionar hero, layouts, carga/streaming y tests afectados.
- [x] Definir tokens, patrones y responsabilidades en estilos compartidos; registrar decisiones visuales duraderas en `design.md`, sin especificaciones duplicadas.
- [x] Definir por interacción: propósito, disparador, frecuencia, estado de salida y variante reducida.

### 2. Fundamentos y hero

- [x] Incorporar patrones compartidos de entrada, respuesta y revelado con fallback visible y movimiento reducido.
- [x] Implementar selector del hero por hover/clic/toque y teclado, con representación explicativa claramente demostrativa, no operación real ni estado ficticio del usuario.
- [x] Animar énfasis y continuidad entre etapas sin mover objetivos de interacción ni robar foco.
- [x] Revisar intención del test que prohíbe `img/svg/canvas`; conservarlo o actualizarlo con justificación, no dejar que un detalle histórico fuerce la composición.
- [x] Revisar hero en navegador antes de extender el vocabulario al resto; no exige nueva aprobación humana.

### 3. Navegación y landing

- [x] Entrada corta de contenido nuevo con estructura estable; comprobar navegación adelante/atrás y ausencia de reinicios de estado.
- [x] Revelar una sola vez bloques seleccionados al entrar en viewport, sin cascadas largas ni esconder contenido si falla la observación.
- [x] Cubrir acceso y superficies públicas además de las privadas cuando el patrón corresponda; evitar animaciones repetidas en acciones frecuentes.

### 4. Microinteracciones de aplicación

- [x] Dashboard: estados hover/press coherentes con la zona realmente clicable, sin convertir filas no interactivas en falsos botones.
- [x] Chat: entrada leve solo de mensajes nuevos; carga inicial, historial y streaming mantienen legibilidad, scroll y selección.
- [x] Revisión/confirmación: actualización y feedback de estados reales, conservando semántica y bloqueo de acciones durante operaciones.
- [x] Resultado/verificador/copia: feedback breve y retorno de “Copiado” a reposo con limpieza de temporizadores y tratamiento de errores.
- [x] Revisar modales/menús existentes sin duplicar animaciones ni alterar foco y cierre.

### 5. Validación, revisión y cierre

- [x] Tests focalizados de hero (mouse/teclado/toque), copia, mensajes nuevos versus historial y estados afectados.
- [x] Lint, typecheck y barreras; build al completar integración. Ejecutar tests de componentes afectados y E2E de navegación/landing y recorridos afectados; ampliar si aparecen regresiones.
- [x] Inspección visual y de estados en Chromium real (escritorio y móvil 390 px) sin errores de consola, saltos de layout ni desborde lateral. Grabaciones y trazas conservadas con límites declarados.
- [x] Verificar contenido visible sin soporte de revelado, ausencia de errores de hidratación y falta de saltos de layout atribuibles al cambio.
- [x] Revisión independiente (`ses_ea7a29a26ffe6dhk6NB0P5MzSi`): resolución de hallazgos en `Reveal` y chat; veredicto final PASS.
- [x] Reconciliar documentación canónica (`design.md`, `tech-debt-tracker.md`, enlaces cruzados) y archivar plan en `docs/exec-plans/completed/` con límites declarados sin alterar contadores ajenos ni planes compartidos.

## Coordinación de agentes

El orquestador conserva estilos compartidos, patrones de entrada/revelado y layouts, fija primero las APIs mínimas y coordina integración. Un implementer trabaja hero/marketing y sus tests; otro trabaja microinteracciones de features y sus tests. Máximo tres carriles y solo con archivos disjuntos: cualquier archivo compartido o E2E transversal se reserva al orquestador. No delegar cambios simultáneos sobre `globals.css`, primitivas o `design.md`.

Después de integrar, reviewer independiente evalúa tanto dirección aprobada como seguridad de estado/foco/streaming, y archiver reconcilia y cierra el plan. Designer se utiliza solo si la prueba del hero revela una decisión visual importante no resuelta; no se requiere otra etapa documental.

## Criterios de aceptación

1. El hero responde de manera perceptible y coherente sin autoplay; es usable por mouse, toque y teclado.
2. Navegar da continuidad sin demoras impuestas ni pérdida de estado/foco/scroll.
3. Landing y aplicación comparten un vocabulario de movimiento, con intensidad distinta según frecuencia y propósito.
4. Historial/streaming no parpadean ni se reaniman; ninguna transición inventa éxito o progreso.
5. Movimiento reducido y fallback conservan todo el contenido y las acciones.
6. Checks ejecutados y revisión visual quedan registrados; límites de entorno no se presentan como pruebas aprobadas.

## Evidencia y decisiones durante la ejecución

### Implementación (coordinador técnico, 2026-10-20)

- **Desviación de proceso informada**: no hubo herramienta de delegación disponible en el entorno del implementador, por lo que un solo agente ejecutó los tres carriles secuencialmente (fundamentos → hero/landing → microinteracciones de aplicación). Fue reportado oportunamente al usuario y aceptado.
- **Fundamentos**: tokens y utilidades `.motion-enter/.motion-fade/.motion-reveal` en `src/app/globals.css`; `src/components/ui/reveal.tsx` y `src/components/ui/use-transient-state.ts` (ubicados en `components/ui` por la barrera de imports de presentación); `template.tsx` en `(app)` y `(auth)`; `motion-enter` en `/verify`.
- **Hero**: `src/features/marketing/components/hero-journey.tsx` (cliente) reemplaza la lista estática; `landing-page.tsx` usa `Reveal` en «Cómo funciona» y «Alcance». Test histórico `img/svg/canvas` conservado (el hero se compone con texto y CSS); el selector de título pasó de `p` a `[data-step-title]` porque un `p` dentro de `button` es HTML inválido.
- **App**: dashboard (entrada escalonada, sin hover en filas no accionables), chat (solo mensajes propios nuevos y burbuja de streaming; historial y respuestas del asistente sin animar), alertas de borrador/error, finalización, distintivos de avance, copia con retorno a reposo (`sealed-version-card`, `share-links-panel`) con estado `role="status"` para lectores de pantalla.
- **Decisiones duraderas registradas** en `design.md` §Intención de movimiento.
- **Entorno del usuario**: el servidor local de desarrollo en puerto 3000 se conservó intacto y no fue interrumpido.

### Revisión independiente y correcciones (sesión `ses_ea7a29a26ffe6dhk6NB0P5MzSi`, 2026-10-20)

El revisor independiente auditó el código y la experiencia en navegador, identificando dos aspectos que requerían corrección antes del veredicto final:

1. **Frontera de observación en `Reveal` (`src/components/ui/reveal.tsx`)**:
   - *Hallazgo*: la configuración de `rootMargin` con margen que no coincidía con la frontera dejaba elementos invisibles al asomar por el borde inferior de la pantalla.
   - *Solución*: se alineó la frontera de intersección a `rootMargin: "0px"`, coincidiendo exactamente con la guarda síncrona inicial de hidratación (`el.getBoundingClientRect().top < window.innerHeight`). Verificado en Chromium real entrando exactamente en borde 0.
2. **Carga asíncrona de historial en chat (`src/features/chat/components/chat-reference.tsx`)**:
   - *Hallazgo*: si el chat montaba con `historyStatus === "loading"` y luego pasaba a `"ready"`, los mensajes preexistentes podían animarse erróneamente como mensajes nuevos entrantes.
   - *Solución*: se implementó un baseline perezoso (`lazy baseline`): `if (baseline === null && historyStatus === "ready") setBaseline(new Set(state.messages.map((m) => m.messageId)))`. Solo los mensajes confirmados tras el baseline animan su entrada.

### Evidencia de validación ejecutada

- **Evidencia postfix independiente (tras correcciones)**:
  - `npm run lint`: ejecutado sobre los 3 archivos tocados sin errores.
  - `npm run typecheck`: OK (0 errores de tipos en todo el proyecto).
  - `npm run test:boundaries`: OK (69 verificaciones de aislamiento arquitectónico aprobadas).
  - `npm test`: suite completa de 102 archivos y 1450 tests unitarios y de integración pasando al 100%.
  - Suites focalizadas verificadas:
    - `src/components/ui/reveal.test.tsx` (3 tests OK).
    - `src/features/chat/components/chat-reference.test.tsx` (14 tests OK).
    - `src/features/marketing/components/landing-page.test.tsx` (12 tests OK).
    - `src/components/ui/use-transient-state.test.ts` (2 tests OK).
    - `src/features/documents/components/sealed-version-card.test.tsx` (2 tests OK).
  - Verificación en Chromium real headless: comprobación directa de `Reveal` activándose en borde 0, interacción del hero por hover/clic/teclado, ausencia de errores de consola y ausencia de desborde horizontal (390 px y escritorio).
  - **Veredicto del revisor independiente**: **PASS**.

- **Evidencia pre-fix (ejecutada antes de los fixes en la fase de integración previa)**:
  - `npm run build`: compilación de producción de Next.js OK.
  - `npx playwright test --project=preview`: 85 tests de preview UI OK.
  - `npx playwright test --project=next`: 57 tests E2E sobre build de producción ejecutados en puerto 3100 aislado (mediante configuración temporal que fue debidamente eliminada y el proceso finalizado, sin tocar el puerto 3000 del usuario).

### Declaración explícita de límites de validación

1. **Re-ejecución de Build y E2E postfix**: no se afirma que `npm run build` ni las suites E2E completas (85 preview + 57 next) se hayan vuelto a correr postfix; la validación final se apoyó en los 1450 tests de Vitest, lint, typecheck, boundaries y navegador Chromium directo.
2. **Trazas y videos**: se grabaron archivos de video y trazas en `%TEMP%/galcoa-motion`, pero NO fueron inspeccionados cuadro por cuadro mediante herramientas de análisis de video. La revisión visual y de estados se sustentó en interacción directa en navegador Chromium y aserciones de DOM. No se declara falsamente una inspección por video.
3. **Métricas de rendimiento**: no se instrumentaron métricas de laboratorio de CLS ni LCP ni perfiles formales de CPU en milisegundos; la verificación de ausencia de saltos o parpadeos se realizó visualmente y por inspección del árbol DOM.
4. **Superficies privadas**: las áreas de chat, dashboard, confirmación y verificación se validaron mediante tests de componentes, contenedores y fixtures locales; no contra bases de datos reales en Supabase ni llamadas de red en vivo.
5. **Hero en móvil (≤390 px)**: en pantallas móviles pequeñas, la ilustración esquemática se posiciona sobre la lista de etapas. Al seleccionar interactivamente etapas bajas mediante toque, el feedback local (marcador y texto activo) responde correctamente, pero la ilustración puede quedar fuera de la porción superior visible de la pantalla, requiriendo scroll manual del usuario. Este comportamiento fue aceptado como seguimiento de UX no bloqueante (deuda técnica nº 12).

## Implementation Outcome

### Implemented

- **Tokens globales y utilidades CSS (`src/app/globals.css`)**:
  - Duraciones orientativas y curvas compartidas: `--motion-press: 140ms`, `--motion-ui: 200ms`, `--motion-exit: 140ms`, `--motion-ease-out: cubic-bezier(.23, 1, .32, 1)`.
  - Clases utilitarias `.motion-enter` (opacidad y ligero desplazamiento vertical hacia arriba), `.motion-fade` (transición de opacidad pura) y `.motion-reveal` (revelado de scroll).
  - Soporte universal de accesibilidad: `@media (prefers-reduced-motion: reduce)` suprime desplazamientos espaciales y transformaciones conservando opacidad y color.
- **Componentes y utilidades compartidas (`src/components/ui/`)**:
  - `Reveal` (`src/components/ui/reveal.tsx`): componente cliente de revelado de scroll único. Renderiza contenido visible en SSR/HTML; oculta tras hidratar únicamente los elementos que estén por debajo del viewport con `rootMargin: "0px"`, activándose a `shown` sin volver a renderizar a los hijos (`data-reveal`).
  - `useTransientState` (`src/components/ui/use-transient-state.ts`): hook para estados temporales con auto-reseteo y limpieza garantizada de temporizadores.
- **Navegación estructural (`src/app/(app)/template.tsx`, `src/app/(auth)/template.tsx`)**:
  - Transición sutil al navegar aplicada exclusivamente al contenedor dinámico de la página sin remount de encabezados, barras laterales ni reinicio de sesiones.
- **Hero interactivo del landing (`src/features/marketing/components/hero-journey.tsx`)**:
  - Selector interactivo de tres etapas (Documentar, Revisar y confirmar, Huella HCS) operable por mouse (hover), clic, toque y teclado (`Tab` / flechas).
  - Composición puramente CSS/texto respetando la restricción de diseño que prohíbe imágenes/SVG/canvas en el bloque.
  - Ilustración esquemática con rótulo de muestra que aclara explícitamente que se trata de un ejemplo demostrativo y no de un documento real.
- **Microinteracciones en la aplicación**:
  - Dashboard: entrada escalonada suave de tarjetas de documentos; hover activo solo sobre elementos accionables («Abrir»), preservando filas informativas estáticas.
  - Chat: entrada sutil limitada a mensajes nuevos propios del autor; historial inicial y respuestas del asistente estáticas para preservar lectura durante el streaming; baseline perezoso tras carga async.
  - Paneles de confirmación y versión sellada: retroalimentación inmediata de copia en `share-links-panel.tsx` y `sealed-version-card.tsx` con retorno a reposo a los 2 s y atributos accesibles (`role="status"`).

### Deviations from Design

- **Hero interactivo frente a preferencia estática**: el diseño canónico original en `design.md §13` contemplaba una preferencia estática para el hero; se consensuó y aprobó con el usuario una pieza interactiva accesible que ilustra el recorrido completo del producto como momento protagonista del landing.
- **Semántica HTML en selector de etapas**: se sustituyeron párrafos `<p>` anidados dentro de botones por selectores de atributos `[data-step-title]` para cumplir con la especificación de HTML válido sin romper los selectores de tests.
- **Ejecución secuencial por límites de entorno**: ante la falta de herramientas de subagentes/delegación en el entorno del implementador, los tres carriles se desarrollaron secuencialmente por un único agente en lugar de en paralelo; la desviación fue informada al usuario y no alteró el alcance ni la calidad del código entregado.

### Validation

- **Revisión independiente (`ses_ea7a29a26ffe6dhk6NB0P5MzSi`)**: veredicto final **PASS** tras verificar la resolución de los dos hallazgos (frontera `rootMargin: "0px"` en `Reveal` y baseline perezoso en chat).
- **Evidencia postfix independiente**:
  - `npm run lint`: sin errores en archivos modificados.
  - `npm run typecheck`: 0 errores.
  - `npm run test:boundaries`: 69 reglas de aislamiento verificadas.
  - `npm test`: suite completa de 102 archivos y 1450 tests pasando al 100%.
  - Suites focalizadas: `reveal.test.tsx` (3 tests), `chat-reference.test.tsx` (14 tests), `landing-page.test.tsx` (12 tests), `use-transient-state.test.ts` (2 tests), `sealed-version-card.test.tsx` (2 tests).
  - Inspección directa en Chromium headless: activación en borde 0 exacto sin desborde.
- **Evidencia pre-fix**:
  - `npm run build`: compilación de producción exitosa.
  - Playwright preview: 85 tests pasando.
  - Playwright Next (producción, puerto 3100 aislado): 57 tests pasando; configuración y proceso limpiados.
- **Límites explícitos**:
  - No se re-ejecutó build ni E2E completo en postfix.
  - Videos y trazas en `%TEMP%/galcoa-motion` grabados pero no examinados por herramientas de video.
  - Sin métricas instrumentadas de laboratorio CLS/LCP ni validación con red real en áreas privadas.

### Follow-up

- **Adaptación móvil de Hero (deuda técnica nº 12)**: en pantallas estrechas (≤390 px), evaluar reposicionar la ilustración esquemática bajo la etapa activa o añadir desplazamiento suave accesible al tocar etapas inferiores.
- **Métricas de rendimiento e inspección de trazas**: instrumentar mediciones formales de CLS/LCP y realizar perfiles de rendimiento antes del lanzamiento productivo o fase de despliegue general.

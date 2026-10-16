# F6 — Motor determinista, controles ALCOA+ y consolidación de advertencias

Tareas del maestro: `MVP-060`, `MVP-061`, `MVP-062`

**Estado: planificado, no ejecutado.** Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3 paso 6, §5, §6 INV-02/10/16, §7, §12.4/12.5/12.15), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-02`, `SH-03`, `SH-08`, `SH-10`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md).

## 1. Objetivo y estado de partida

`MVP-060`: funciones puras que calculan las dimensiones de estado del PRD §5 (mismos eventos → mismo resultado). `MVP-061`: indicadores ALCOA+ proporcionados (carga tardía, lotes retroactivos, valores repetidos, metadatos de PDF), como señales de revisión y no como fraude ni bloqueo. `MVP-062`: unificar advertencias del Agente 1, del Agente 2 y de las reglas con sus fuentes, sin elegir ni inventar y sin bloquear.

**Estado real verificado:** no existe `src/lib/rules/`. Solo están los enums y `DocumentWarningSchema` de [`document.ts`](../../../../src/lib/contracts/document.ts) (cuatro de las cinco dimensiones; no hay campo de procedencia en el resumen). `src/lib/rules/` no figura en `SERVER_DIRS`: debe seguir puro (sin SDK, entorno ni UI) y solo depende de contratos.

## 2. Criterios y dependencias

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-060` | REQ-07, INV-02, PRD §12.5 | Motor determinista; no deriva «aprobado» de la ausencia de advertencias |
| `MVP-061` | REQ-07, INV-09, INV-16 | Indicadores no fraude ni bloqueo; umbrales no universales |
| `MVP-062` | REQ-07, INV-02, INV-10, PRD §12.4/12.15 | Advertencias unificadas con fuentes; contradicciones y unidad ausente visibles, sin bloquear |

| Para | Requiere `completada` (checkpoint por ID) |
| --- | --- |
| `MVP-060` | `MVP-021` |
| `MVP-061` | `MVP-060` y `MVP-043` |
| `MVP-062` | `MVP-053` y `MVP-061` |

Orden: `060` → `061` → `062`; `060` puede iniciarse sin esperar a `043` ni `053`. Salidas: `MVP-070` (snapshot), `MVP-075` (estado de confirmaciones), `MVP-091` (sello) y los resúmenes de dashboard consumen el motor de `MVP-060`. Este plan no es prerrequisito de ningún plan de F4/F5.

## 3. Decisiones, límites y pendientes

- **Contratos de entrada (`MVP-020/021`) son base compartida.** Si el motor necesita una forma de eventos/hechos que `MVP-021` no define, el tipo vive localmente en `src/lib/rules/` (importando solo contratos) y se registra como solicitud; no se reabre el contrato.
- **Reglas de las dimensiones** (derivadas del PRD §5; se confirman con el líder al implementar):
  - Control documental: `sin_evaluar` sin reporte del Agente 2 ni reglas ejecutadas; en otro caso, precedencia `contradiccion_critica` > `con_advertencias` > `sin_inconsistencias_criticas_detectadas`. Esta última solo con una evaluación realizada; **nunca** por ausencia de advertencias.
  - Confirmaciones: `pendiente/parcial/completa/rechazada/sustituida` desde selección fija y respuestas de **esa** revisión/snapshot (siempre incluye al autor); un rechazo ⇒ `rechazada`; revisión sustituida ⇒ `sustituida`; sin heredar de otra revisión.
  - Procedencia: `declarado_por_autor` si solo autor; `declarado_y_corroborado_por_tercero` solo con `completa` e incluyendo al menos un tercero.
  - Sello: `no_iniciado` sin versión finalizada; `registrado` solo con registro comprobado; `pendiente` con versión finalizada sin registro probado. `fallido` describe un intento HCS (`SH-03`).
- **Criterios ya definidos por [sources-and-ai §2–§3](../../../specs/sources-and-ai.md) (no son decisión de producto abierta):** `listo_para_revision` exige propuesta, reporte y hallazgos completos, válidos y persistidos sobre la **misma entrada**, y **no** exige ausencia de advertencias; salida incompleta o inválida no lo habilita. Para HCS, el agregado de versión permanece `pendiente` sin registro probado y `fallido` describe un **intento** histórico separado: el resumen muestra `pendiente` hasta que exista registro probado, sin sobrescribir la historia de intentos (`SH-03`). El motor implementa estos criterios; solo lo que la spec deja a `MVP-021` (forma exacta de los contratos) se solicita allí.
- **Umbrales de `MVP-061`:** no universales ni aprobados (F1, [sources-and-ai §7](../../../specs/sources-and-ai.md), `RQ-B1`). Se inyectan como configuración por proceso; sin configuración el indicador devuelve «no evaluado: umbral no configurado» y no usa un valor oculto. Valores de ejemplo para desarrollo se etiquetan «propuestos, no aprobados».
- **Severidad de indicadores ALCOA+:** la spec admite `warning` o `critical` sin convertirla en permiso y no fija una severidad automática por indicador. Propuesta técnica de este plan: `warning` como máximo para no sugerir acusación (INV-16); `critical` queda para contradicciones materiales de fuentes. La severidad por contexto sigue pendiente de F1 (`MVP-013`).
- **Metadatos de PDF** (productor, fechas) los provee la extracción de `MVP-043` según `MVP-010`; si no existen, el indicador responde «no evaluable», nunca presume edición maliciosa.
- **Proyección compartible con alias** (`SH-02`): `MVP-062` entrega la función pura que convierte advertencias con fuentes privadas en «Fuente A/B» sin IDs, rutas, extractos ni nombres de archivo; `MVP-070` (otro grupo) la invoca al congelar. La frontera exacta se confirma con ese plan (§9).
- **Quién usa el motor:** `MVP-075` y los resúmenes deben invocar `src/lib/rules/`, no reimplementar el cálculo (solicitud §9).

## 4. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `src/lib/rules/` | Motor de dimensiones, indicadores ALCOA+, consolidación y proyección con alias (puros) | `server-only`, SDK, `fetch`, `process`, UI, mocks, fixtures |
| `src/lib/documents/` | Servicio que carga borrador/reportes/hallazgos y llama a las funciones puras | Lógica de revisión o finalización |
| `src/lib/contracts/` | Solo ajuste mínimo autorizado | Redefinir enums |
| `tests/contracts/`, `tests/server/` y `src/lib/rules/*.test.ts` | Tests deterministas con datos ficticios | Llamadas a modelos |

## 5. Pasos

### 5.1 MVP-060 — Motor

- [ ] Verificar `MVP-021`; tipos de entrada del motor (local o contrato) y funciones por dimensión, sin reloj implícito: el tiempo entra como parámetro.
- [ ] Tablas de decisión exhaustivas para confirmaciones, control, procedencia y sello; entradas inválidas rechazadas con error explícito (no valor por defecto engañoso).
- [ ] Pruebas de propiedad: mismos eventos en distinto orden de llegada estable producen el mismo resultado cuando el contrato fija orden; sin dependencia de `Date.now()` ni aleatoriedad.
- [ ] Una versión histórica finalizada coexiste con un nuevo borrador: el resultado identifica a qué revisión/versión se refiere cada dimensión (`SH-03`).

### 5.2 MVP-061 — Controles ALCOA+

- [ ] Verificar `MVP-043` (metadatos) y `MVP-060`.
- [ ] Indicadores puros: carga tardía (fecha declarada vs. carga del servidor, a la precisión declarada; fecha sin hora/zona no se completa), lote retroactivo (varias mediciones declaradas en tiempos distintos cargadas en una ventana corta), valores idénticos repetidos, metadatos de PDF (diferencias creación/modificación, productor).
- [ ] Salida `RuleFinding` con código estable, texto neutro («señal de revisión»), severidad, fuentes privadas y parámetros usados; nunca «fraude», «manipulado» ni bloqueo.
- [ ] Fechas desconocidas: «no evaluable», sin sustituir por la fecha de carga (INV-09).

### 5.3 MVP-062 — Consolidación

- [ ] Verificar `MVP-053` y `MVP-061`.
- [ ] Función pura que une advertencias del Agente 1, hallazgos del Agente 2 y hallazgos de reglas, cada una con origen (`agente1|agente2|reglas`), `draftRevision` evaluada y fuentes privadas. Agrupar solo cuando la clave es determinista (mismo código y mismas fuentes); nunca descartar una contradicción.
- [ ] Cantidades contradictorias: ambas cifras y fuentes; unidad ausente: «unidad no informada»; fecha ausente: «fecha no informada». No elegir, no inferir, no bloquear.
- [ ] Marcar reportes evaluados sobre un `draftRevision` anterior como «desactualizados» (informativo, no bloqueo): pueden mostrarse en privado al autor, pero **no** se reutilizan como evaluación vigente de otra `draftRevision` al congelar; `MVP-070` solo consolida propuesta, reporte y hallazgos de la misma entrada (sources-and-ai §2–§3).
- [ ] Función de proyección con alias para el snapshot compartible; esquema de salida estricto por allowlist (sin spread de registros privados) y tabla privada alias→fuente devuelta aparte.
- [ ] Servicio en `src/lib/documents/` que arma la entrada desde datos persistidos (sin reconsultar IA).

## 6. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| `MVP-060` mismo resultado | Secuencias idénticas de eventos ⇒ salidas idénticas en varias ejecuciones (PRD §12.5); agentes doblados |
| `MVP-060` sin «aprobado» | Sin reporte del Agente 2 ni advertencias ⇒ `sin_evaluar`, no `sin_inconsistencias_criticas_detectadas` |
| `MVP-060` dimensiones | Tabla completa de selección × respuestas ⇒ `pendiente/parcial/completa/rechazada/sustituida`; solo autor ⇒ procedencia `declarado_por_autor` |
| `MVP-060` sello | Finalizada sin registro probado ⇒ `pendiente`; registro comprobado ⇒ `registrado` |
| `MVP-061` indicadores | Carga tardía, lote retroactivo, repetidos y metadatos PDF producen hallazgos con texto neutro; sin umbral configurado ⇒ «no evaluado» |
| `MVP-061` no bloqueo | Ningún hallazgo contiene campo de bloqueo; severidad nunca implica fraude |
| `MVP-062` contradicción | «10 cajas» vs «12 cajas» (remito): ambas cifras y fuentes visibles, ninguna elegida (PRD §12.4, §12.15) |
| `MVP-062` unidad ausente | Medición «7» sin unidad: advertencia «unidad no informada», sin dato inventado; sigue disponible para confirmar |
| `MVP-062` unificación | Advertencias de los tres orígenes con fuentes; agrupación determinista; reporte desactualizado marcado y no usado como evaluación de otra `draftRevision` |
| `MVP-062` privacidad | Proyección compartible sin IDs internos, rutas, URLs firmadas ni nombres de archivo; esquema estricto rechaza campos extra |

## 7. Validación, evidencia y rollback

`lint`, `typecheck`, `npm test`, `test:boundaries` (pureza de `src/lib/rules/`); `build` si hay servicio. **Evidencia actual: no ejecutado.** La calidad real de los agentes se mide en `MVP-123/135`, no aquí; estas funciones no usan proveedores. Rollback: revertir archivos del plan; son funciones puras sin efectos externos.

## 8. Cierre

Se valida tras integrar. Actualizar solo `MVP-060`, `MVP-061`, `MVP-062` y el recuento del maestro, cada fila cuando se complete con su propia evidencia; luego archivar el plan. Escribir este documento no cambia estados. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 9. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§2, §3 y §7): contenido mínimo de hallazgos (origen, fuentes, severidad `warning|critical`), situaciones esperadas, `listo_para_revision` y registro F1 de umbrales/severidades (propuestos, no aprobados); `RQ-B2` — [data-transactions](../../../design/data-transactions.md): dónde se persisten hallazgos de reglas y reportes por `draftRevision`.

**Solicitudes:** a `MVP-021` (eventos/hechos de entrada, dimensión de procedencia en contratos); a `MVP-043` (metadatos de PDF, proveedor/método por extracción); a `MVP-070` (invocar la proyección con alias; confirmar frontera de la proyección); a `MVP-075` (usar el motor); a `MVP-091/092` (exponer estado de intento y de registro por separado).

**Decisiones pendientes:** severidad por contexto y umbrales numéricos de indicadores (F1, `MVP-013`), sin aprobar. El criterio de `listo_para_revision` y el uso de `fallido` ya están definidos en sources-and-ai y no quedan abiertos. Las partes independientes avanzan.

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Previo: [Agente 2](f05-agent2-groq-contrast.md)

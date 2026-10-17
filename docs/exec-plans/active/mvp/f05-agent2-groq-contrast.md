# F5 — Agente 2: contraste con Groq y fuentes textuales independientes

Tareas del maestro: `MVP-053`

**Estado: servicio implementado con dobles (2026-10-16, Issue #15).** Decisiones locales: JSON Schema en modo no estricto (la forma se garantiza con Zod); el resultado debe coincidir con los hallazgos (crítico → `contradiccion_critica`) o es error técnico; contexto excedido se rechaza sin truncar (MVP-013 §7.3: sin truncado), así que no hay omisiones. Pendiente: adaptador real del reporte, Route Handler (sesión MVP-030), auditoría y extracciones reales. Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3 paso 5, §4 REQ-06 y «Límites de actuación», INV-02, INV-07, INV-10), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-02`, `SH-03`, `SH-08`, `SH-10`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md).

## 1. Objetivo y estado de partida

Contrastar el borrador del Agente 1 con los **mensajes originales** y el **texto extraído** de las evidencias, no solo con el resumen, mediante `groq-sdk` y `openai/gpt-oss-120b`; salida Zod con los tres resultados; reporte persistido; el Agente 2 **nunca veta** (INV-02).

**Estado real verificado:** `groq-sdk` no está instalado; no existe cliente Groq, reportes ni extracciones. Nada está implementado.

## 2. Criterios y dependencias

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-053` | REQ-06, INV-02, INV-07 | Instala `groq-sdk`; recibe mensajes originales + texto extraído; salida con los tres resultados; reporte persistido; nunca veta |

**Entrada:** `MVP-013` (parámetros, timeouts y calidad mínima documentados), `MVP-043` (extracciones) y `MVP-051` (borrador). **Salida:** `MVP-062` (consolidación) y `MVP-123` (runner de evaluación). No depende de `MVP-052` ni de `MVP-054`.

## 3. Decisiones y pendientes

- **Fijado por D-05:** modelo `openai/gpt-oss-120b` con `groq-sdk`; no se cambia localmente.
- **Resultados** (existentes en `ControlStatusSchema`, [`document.ts`](../../../../src/lib/contracts/document.ts), sin `sin_evaluar`): `sin_inconsistencias_criticas_detectadas`, `con_advertencias`, `contradiccion_critica`. Son informativos; no habilitan ni vetan; la ausencia de hallazgos no prueba un hecho (PRD §4).
- **Límite de texto:** el modelo recibe solo texto. Lo que Gemini interpretó de una foto/PDF puede contrastarse, pero **no** aporta independencia visual ni demuestra fidelidad OCR (`SH-08`): la limitación se persiste y se muestra siempre que alguna fuente provenga de una interpretación de Gemini.
- **Pendiente `MVP-013`:** si la entrada excede el límite de contexto o de coste, ¿se segmenta o se informa límite? Hasta decidirlo, **no se trunca en silencio**: la fuente no incluida se lista en el reporte como limitación. Tampoco hay umbral de calidad aprobado; no se afirma uno.
- **Disparo del contraste:** este plan ofrece servicio y Route Handler propios (propuesta `POST /api/documents/[id]/verification`). El cableado en pantalla no pertenece a un plan cuya dependencia incluya `MVP-053` (`MVP-054` no depende de ella); se registra la solicitud en §9.
- **Salida estructurada de `gpt-oss-120b` con `groq-sdk`:** verificar con la documentación oficial vigente (PRD §18) qué modo de salida estructurada admite el modelo; no se asume.

## 4. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `package.json`, lockfile | Instalar `groq-sdk` con npm, revisar peers y auditoría | `@ai-sdk/groq` u otros proveedores |
| `src/lib/ai/` | Cliente Groq `server-only` (configuración al invocar, `GROQ_API_KEY` por nombre), servicio de contraste, prompt versionado | Veto, bloqueo de estados, congelar, HCS, herramientas |
| `src/lib/documents/` | Persistencia del reporte y lectura de fuentes autorizadas | Sobrescribir reportes |
| `src/app/api/` | Handler delgado del contraste | Endpoints ajenos |
| `tests/server/` | Dobles de Groq, casos de contraste | Dobles en producción |
| Presentación | Nada | Todo |

## 5. Pasos

- [ ] Verificar `MVP-043`, `MVP-051` y `MVP-013` integradas/documentadas; leer la fila.
- [ ] `npm install groq-sdk`; revisar lockfile y auditoría (deuda #3 del [tracker](../../tech-debt-tracker.md), sin cerrarla desde aquí).
- [ ] Cliente Groq: configuración al invocar; falta de clave → error técnico explícito, sin fallback; sin `tools`; `AbortSignal` y timeouts de `MVP-013`.
- [ ] Armar la entrada exacta: mensajes originales + extracciones con referencias + borrador a contrastar; todo como datos no confiables delimitados, sin credenciales, URLs firmadas ni IDs que no hagan falta. Registrar la lista de fuentes realmente incluidas y las omitidas.
- [ ] Prompt versionado: informar discrepancias con referencias a las fuentes, sin juzgar fraude, sin proclamar verificación visual.
- [ ] Salida Zod: resultado ∈ los tres valores, hallazgos con severidad, referencias de fuente **validadas contra las fuentes enviadas**, limitaciones. Salida inválida = error técnico reintentable de la etapa; nunca se fabrica un reporte ni se rellena con «sin inconsistencias».
- [ ] Persistir reporte inmutable (`reportId`): entradas exactas (IDs/hashes), borrador/`draftRevision` evaluados, modelo, `promptVersion`, tiempo del servidor, resultado, hallazgos y limitaciones; una nueva evaluación crea otro reporte; no se reconsulta para reconstruir historia (`SH-08`, INV-07).
- [ ] Garantizar por construcción que el servicio y su DTO no exponen campo de bloqueo/veto (`blocking`, `allowed` u otro): solo informan.
- [ ] Auditoría de ejecución y fallo por `MVP-044`, sin contenido; logs solo con correlación.
- [ ] Handler: sesión y propiedad, validación, llamada al servicio, proyección de errores.

## 6. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| Recibe fuentes originales | El doble registra su entrada: contiene mensajes y texto extraído completos con referencias, no solo el borrador |
| Tres resultados | Un caso por resultado; valor fuera del conjunto o referencia inexistente → error técnico de formato |
| Reporte persistido | Campos de §5; segunda evaluación crea otro reporte; el primero no cambia |
| Nunca veta | `contradiccion_critica` no cambia ninguna otra dimensión ni impide ninguna operación; el DTO no tiene campos de bloqueo |
| Independencia visual | Extracción interpretada por Gemini → limitación persistida; ninguna salida afirma verificación visual independiente |
| Límite de contexto | Entrada excedida: no se trunca en silencio; omisión listada o error técnico según la decisión de `MVP-013` |
| Fallo del proveedor/config | Error técnico explícito sin reporte ni éxito falso |
| Inyección | Contenido con instrucciones no altera esquema ni dispara acciones |

## 7. Validación, evidencia y rollback

`lint`, `typecheck`, `npm test`, `test:boundaries`, `build`. **Evidencia actual: no ejecutado.** Llamadas reales a Groq requieren autorización (`MVP-134/135`) y no se hacen aquí; la calidad de detección la mide `MVP-122/123/135`. Un fallo de red no se enmascara con mock ni resultado benigno. Rollback: revertir paquete, lockfile y archivos del plan.

## 8. Cierre

Tras integrar y repetir checks: actualizar solo `MVP-053` (y recuento) y archivar. Este documento no marca el estado. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 9. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§2, §4 y §7): contenido mínimo del reporte (resultado, hallazgos con fuentes, limitaciones), contraste sobre originales y extracciones, contexto excedido como fallo técnico y parámetros de `MVP-013` (propuestos, no aprobados); `RQ-B2` — [data-transactions](../../../design/data-transactions.md): persistencia de reportes y su vínculo a `draftRevision`.

**Solicitudes:** a `MVP-020/021` (esquema de reporte); a `MVP-043` (marcar proveedor/método de cada extracción); a `MVP-054`/`MVP-077` o al integrador: decidir quién dispara el contraste desde la UI (ninguno depende hoy de `MVP-053`); a `MVP-062` (consumirá hallazgos y limitaciones); a `MVP-123` (reutilizar el servicio sin llamadas en PRs).

**Decisiones pendientes:** `MVP-013` (contexto excedido y calidad mínima). Las demás partes avanzan sin ella.

## 10. Persistencia SQL del reporte (migración `20261016002502`, rama `feat/contrast-report-persistence`)

Implementado el lado SQL; el adaptador `ContrastStore` real y el cambio de `get_freeze_source` (discriminar `kind`, consolidar Agente 1 + Agente 2 + reglas) quedan para la siguiente entrega. Contrato para el adaptador, vía `galcoa_executor` (actor explícito):

`public.persist_contrast_report(p_actor_id uuid, p_document_id uuid, p_draft_id uuid, p_draft_revision int, p_draft_content jsonb, p_result text, p_findings jsonb, p_inputs jsonb, p_model_id text, p_prompt_version text, p_limitations jsonb, p_correlation_id text) → jsonb`

- `p_draft_*` = borrador `b1` evaluado (`Draft.draftId/draftRevision/content` tal como los leyó `getCurrentDraft`); `p_inputs` = `SaveReportInput.inputs` (con `b1` de `kind: "borrador"` y `id = draftId`); `p_findings` con claves `message/severity/sourceRefs`.
- Estados: `{status:"created", reportId, createdAt}`; `{status:"stale_draft"}` (id, revisión o contenido distintos del vigente, o sin borrador; cero escrituras); `{status:"not_available"}` (ajeno o inexistente). Forma o referencias inválidas (resultado incoherente con hallazgos, ref no enviada, mensaje/extracción de otro documento o de evidencia no aceptada) lanzan `22023`; sin actor, `42501`.
- Formato en `verification_reports`: `input = {kind:"contraste", schemaVersion:1, inputs, draft:{draftId, draftRevision, content}}`, `output = {kind:"contraste", schemaVersion:1, draftId, draftRevision, result, findings}`, `rules_version = "contraste-v1"` (nombra el formato; no afirma reglas ejecutadas). `report_sources` solo mensajes y extracciones. Auditoría `contrast_report.created` sin contenido. Cada llamada exitosa crea otro reporte; no cambia estado, confirmaciones ni snapshots.
- Límites de la RPC: hallazgo ≤ 4000 caracteres, ≤ 200 hallazgos, ≤ 401 refs por hallazgo, ≤ 50 limitaciones de ≤ 1000 caracteres. Los de hallazgos y refs se validan también en el servicio (`CONTRAST_STORAGE_LIMITS`, `src/lib/ai/groq/contrast.ts`) antes de `saveReport`: exceder devuelve `AI_INVALID_OUTPUT` sin truncar ni llamar al store (no es un reintento de almacenamiento). Las limitaciones son constantes internas (2 textos fijos), no salida del modelo, así que no llevan `max` en el schema.
- `createdAt`: la RPC genera `now()` una vez, lo inserta explícito en `created_at` y lo devuelve sin `RETURNING` (el rol no tiene `SELECT` sobre `verification_reports`; sin ampliar grants ni políticas).

**Corrección PR108 (CI servidor local falló por `RETURNING created_at` sin SELECT):** aserciones nuevas en `tests/server/local/contrast-report-persistence.test.ts` (`created_at` almacenado = `createdAt` devuelto; el rol sigue sin `SELECT` en reportes) y fronteras en `tests/server/ai/contrast/contrast.test.ts`. Typecheck, ESLint, `tests/server/ai/contrast` (29) y `test:boundaries` OK localmente; SQL real pendiente de CI.

**Tope de entradas (revisión PR108):** `p_inputs` admite ≤ 401 entradas incluyendo `b1`; `CONTRAST_STORAGE_LIMITS.maxInputs = 401` se comprueba en `contrastDraft` ANTES de llamar a Groq. Si hay más, devuelve `INPUT_TOO_LARGE` (etapa `validacion`, `retryable: false`) sin llamar a Groq ni al store y sin truncar ni omitir fuentes. `TechnicalError.code` es un string estable (`^[A-Z][A-Z0-9_]*$`), no un enum cerrado; no existía un código equivalente para entrada excesiva (solo `PAYLOAD_TOO_LARGE`, que es HTTP de otra ruta), así que se usa `INPUT_TOO_LARGE`. El SQL y el límite no cambian.

**Evidencia previa:** `npm run typecheck` y ESLint de los tests nuevos: OK. Las pruebas `tests/server/local/contrast-report-persistence.test.ts` y el catálogo RLS **no se ejecutaron localmente** (Supabase local no reservado); pendientes de CI Linux.

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Previo: [Evidencias](f04-evidence-upload-extraction.md) y [Agente 1](f05-agent1-drafting.md) · Siguiente: [Reglas y advertencias](f06-rules-and-warnings.md)

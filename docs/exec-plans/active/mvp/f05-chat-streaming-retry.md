# F5 — Chat en streaming, cancelación y reintento

Tareas del maestro: `MVP-052`

**Estado: planificado, no ejecutado.** Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3, §4 REQ-05, REQ-15, REQ-16, §11), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-01`, `SH-03`, `SH-04`, `SH-05`, `SH-07`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md).

## 1. Objetivo y estado de partida

Respuesta del chat en streaming desde el servidor; cancelar y reintentar sin duplicar ni perder mensajes; un fallo del proveedor no deja estado falso; los eventos quedan auditados. Esta tarea cubre el **lado servidor** (servicio de turno y Route Handler) y su protocolo; el cableado en pantalla es `MVP-054`.

**Estado real verificado:** no existen rutas de chat, `useChat`, mensajes persistentes, auditoría ni cliente Gemini. Nada de lo descrito está implementado.

## 2. Criterios y dependencias

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-052` | REQ-03, REQ-05, REQ-15, REQ-16, INV-08 | Streaming; cancelar/reintentar sin duplicar ni perder mensajes; fallo del proveedor sin estado falso; eventos auditados |

**Entrada:** `MVP-051` (Agente 1) y `MVP-044` (auditoría); transitivamente `MVP-041` y `MVP-050`. **Salida:** `MVP-054` (container y pantalla). No depende de `MVP-053` ni de los planes de F6; no incluye evidencias (`MVP-042`).

## 3. Decisiones y pendientes

- **Orden de persistencia del turno:** el mensaje del usuario se persiste (`MVP-041`) **antes** de llamar al proveedor; si el proveedor falla, el original sigue conservado.
- **Mensajes originales vs. artefactos:** el original del usuario es inmutable; la respuesta del asistente es un mensaje propio que **referencia** (por ID) el borrador/reporte generado; no incrusta ni reescribe artefactos, y la edición de un borrador es otra propuesta con `draftRevision` (`SH-01`).
- **Respuesta parcial al cancelar o fallar:** propuesta técnica por defecto, a confirmar con el esquema de `MVP-020`: el mensaje del asistente se persiste solo al completarse; el texto parcial no se vuelve mensaje oficial; el estado `cancelado`/`fallido` vive en la **operación técnica** del turno (`operationId`, `SH-01`) y en auditoría, no como estado de producto nuevo.
- **Operación de turno y unicidad** («un turno completado por mensaje de usuario»): requiere soporte de `MVP-022/023` (solicitud §9). Hasta definirlo, la lógica se prueba con doble.
- **Cancelación en serverless:** un `abort` del cliente no garantiza que el servidor alcance a escribir; por eso el estado se recupera mediante claim con vencimiento (como en `SH-05`): una operación `en_curso` vencida se trata como cancelada/fallida al reintentar. Detalles de límites de ejecución dependen de `MVP-013`.
- **Una o dos llamadas al modelo por turno:** decisión técnica local acordada con `MVP-051`; no cambia contratos ni producto.
- **Protocolo de streaming y `useChat`:** verificar con la documentación de la versión instalada de `ai`/`@ai-sdk/react`; no se fija aquí una receta de API.

## 4. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `src/lib/documents/` o `src/lib/ai/` | Servicio de turno (idempotencia, claim, reintento, cancelación), `server-only` | Finalización, HCS, aprobación |
| `src/app/api/documents/[id]/chat/` (propuesta de ruta) | Route Handler de streaming, validación, autorización | Endpoints de otras tareas; Server Actions |
| `tests/server/` | Pruebas del servicio y del protocolo con dobles | Dobles en producción |
| `src/features/chat/` | Nada (container y componentes son de `MVP-054`) | Todo |

Antes de implementar leer `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (incluye streaming) y `03-api-reference/03-file-conventions/route.md`.

## 5. Pasos

- [ ] Verificar `MVP-051` y `MVP-044` integradas; leer la fila.
- [ ] Contrato del comando de turno: documento, `clientMessageId`/clave de idempotencia, texto, fecha declarada opcional; fingerprint del comando. Mismo comando → resultado/operación existente; misma clave con contenido distinto → conflicto (`SH-04`).
- [ ] Servicio: validar sesión y propiedad → persistir mensaje del usuario (idempotente) → abrir operación con claim → invocar Agente 1 (`MVP-051`) con `AbortSignal` → emitir el flujo → al completar, persistir mensaje del asistente con referencias a artefactos y cerrar la operación.
- [ ] Cancelación: propagar `abort` al proveedor; marcar la operación `cancelada` si puede escribir, o dejarla vencer; no persistir el parcial como oficial; no perder el mensaje del usuario.
- [ ] Reintento: nueva solicitud referida al mismo mensaje de usuario y turno; crea otro intento; nunca otro mensaje de usuario ni dos respuestas completadas para el mismo turno; un reintento mientras hay un intento vigente devuelve «en curso», no lo duplica.
- [ ] Fallo del proveedor: error técnico estable (etapa, reintentable, correlación) en el flujo y en la operación; sin mensaje de asistente ni borrador fabricado; el documento mantiene su estado previo.
- [ ] Auditoría vía `MVP-044`: inicio, finalización, fallo, cancelación y reintento del turno, solo con identificadores y correlación; sin texto del chat ni prompts.
- [ ] Route Handler: valida entrada con el esquema del comando, llama al servicio, devuelve el stream y los errores proyectados; sin tokens, claves ni contenido en logs.
- [ ] Prueba de protocolo: consumir el stream en Vitest (Node) para verificar orden, fin normal y error a mitad de stream.

## 6. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| Streaming | El doble emite fragmentos; el consumidor los recibe en orden y el mensaje final persistido coincide con el flujo completo |
| Cancelar sin perder | Abort a mitad: el mensaje de usuario sigue persistido, no hay mensaje de asistente oficial, la operación queda cancelada o vencida |
| Reintento sin duplicar | Reintento del mismo turno tras cancelar/fallar: un solo mensaje de usuario y una sola respuesta completada; doble envío simultáneo: un intento activo |
| Idempotencia | Mismo `clientMessageId` y contenido: mismo resultado; contenido distinto: conflicto |
| Fallo del proveedor | Error a mitad y al inicio: error técnico explícito, sin borrador/mensaje falso, estado del documento sin cambios |
| Auditoría | Cada transición emite un evento con IDs y sin contenido; reintento de emisión no duplica |
| Autorización | Documento ajeno o sin sesión: denegado antes de llamar al proveedor |

Concurrencia real (dos conexiones) requiere la base local de `MVP-120`; si no existe, se deja constancia de «no verificado en base real».

## 7. Validación, evidencia y rollback

`lint`, `typecheck`, `npm test`, `test:boundaries`, `build`. **Evidencia actual: no ejecutado.** Streaming contra Gemini real no se prueba aquí (autorización: `MVP-134`); nunca se sustituye por un mock en producción. Rollback: revertir archivos del plan; cualquier tabla de operaciones pertenece a `MVP-022/023`.

## 8. Cierre

Tras integrar y repetir checks: actualizar solo `MVP-052` (y recuento) y archivar. Este documento no marca el estado. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 9. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§2 y §4): cancelación, reintento y fallos; timeouts y tamaños del turno son de `MVP-013` (propuestos, no aprobados); `RQ-B2` — [data-transactions](../../../design/data-transactions.md): operación de turno, claim/vencimiento y unicidad de respuesta completada.

**Solicitudes:** a `MVP-020/021` (mensaje del asistente con referencias a artefactos, operación técnica y error estable); a `MVP-022/023` (operación durable de turno y restricción de unicidad); a `MVP-054` (consumir este protocolo con `@ai-sdk/react`); a `MVP-130` (límites de uso y rate limit del endpoint).

**Decisiones pendientes:** valores de `MVP-013`; tratamiento del texto parcial (propuesta arriba, a confirmar con `MVP-020`).

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Previo: [Agente 1](f05-agent1-drafting.md) · Siguiente: [Chat conectado](f04-connected-chat.md)

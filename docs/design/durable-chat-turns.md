# Publicación durable del turno de chat

**Decisión:** la generación prepara una propuesta ligada a un intento; solo completar el turno publica borrador y mensaje oficial, en una única transacción SQL. Un intento cancelado, vencido o sustituido nunca deja un borrador que F7 pueda congelar.

Implementa la etapa B del [plan de cierre](../exec-plans/active/mvp-consolidated-closure.md), respetando [transacciones](data-transactions.md) y los planes F5 del maestro. Es decisión de integración, no evidencia de implementación ni cambio de producto.

## Autoridad y operaciones

- Un turno por `(document_id, client_message_id)`, con fingerprint de la intención completa. Intentos monotónicos funcionan como fencing; claim con reloj SQL y lease de 90 s. Reintento conserva mensaje del autor y nunca duplica una respuesta completada.
- Actor y referencia `{ turnId, attempt }` viajan explícitamente. No identidad global ni closure mutable para inyectar un claim en la persistencia.
- RPC internas enumeradas en el ejecutor; owner NOLOGIN sin bypass, `search_path` vacío, sin EXECUTE para roles web. Lock común: documento → borrador cuando corresponda → turno. Ninguna llamada a proveedor bajo locks.
- Tabla técnica de turnos con RLS y staging del intento; no duplicar `public.drafts` (una fila por documento). F7 solo lee el borrador publicado, nunca staging.
- Mensaje autor persistido y vinculado antes de invocar IA. La clave de mensaje deriva por hash del identificador completo y su contexto; no truncar prefijos que puedan colisionar.

## Publicación y cancelación

`stageProposal` guarda propuesta, entradas exactas, revisión esperada, modelo/prompt y limitaciones, sin actualizar el borrador oficial. Repetición exacta devuelve el mismo resultado; otro contenido para el mismo stage no se acepta silenciosamente.

`complete_chat_turn` verifica propietario, intento vigente, estado, lease, mensaje y staging; compara revisión esperada; publica borrador/procedencia, mensaje agente, cierre y auditoría en el mismo commit. Replay devuelve el resultado conservado. Un rollback no deja borrador ni mensaje parcial. Conservar ID del borrador al aumentar su revisión.

Si cancelación gana el lock, completion falla como stale. Si completion ya hizo commit, una cancelación tardía no revierte el resultado. Recuperar lease invalida staging anterior. Emitir `draft`, `agent_message` y `done` solo después del commit; abortar consumidor NDJSON debe propagar AbortSignal y cerrar el intento en finally.

## Contraste y lectura congelada

Reutilizar reportes/fuentes append-only con discriminante versionado de redacción/contraste. `get_freeze_source` debe distinguirlos e incorporar advertencias de ambos agentes y reglas; no elegir sin discriminante el último reporte de la revisión.

Contraste compara borrador ID/revisión antes de insertar: resultado tardío no escribe ni se aplica a una revisión futura. `b1` se conserva como entrada exacta evaluada, no como evidencia falsa en `report_sources`. Reglas/modelos ejecutados se registran honestamente; no fingir evaluación de reglas por completar un campo.

## Entregas y prueba

1. `02500`: tabla/claims/attach/close, seguridad y regresiones. Sin componer runtime incompleto.
2. `02501`: staging/publicación atómica y pruebas de rollback/concurrencia.
3. Adaptadores/contratos explícitos; luego orquestación/abort, contraste CAS y composición HTTP/UI. Usar siguientes `025xx` si una unidad SQL lo requiere. Reservadas `02300` para evidencias y `02400` para ajustes previos, no ocuparlas.

Cada PR mantiene ≤600 líneas authored con tests, sin contar docs/lock. Las tablas/RPC aisladas no acreditan chat funcional. Probar con Supabase local y proveedores doblados: doble claim, lease, worker viejo, cancelar después de stage, completion vs freeze/cambio de borrador, rollback, replay, contraste tardío, aislamiento A/B/anon/authenticated y claves largas. La disponibilidad gratuita de modelos y el transporte real se acreditan en la sesión final, no en estos tests.

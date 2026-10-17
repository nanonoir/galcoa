# F7-01 — Revisión congelada y confirmación del autor

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada; su cierre y el de sus filas dependen del [maestro](../mvp-master-plan.md) (§8).

Tareas del maestro: `MVP-070`, `MVP-071`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.7–3.12, §5, §6, §8, §12.3, 12.11) · [arquitectura](../../../architecture.md) · [fundaciones compartidas](../../../design/mvp-shared-foundations.md) (SH-01, SH-02, SH-04, SH-07) · [desarrollo](../../../development.md#checks-según-el-cambio).

## 1. Alcance

Congelar una revisión (snapshot completo de operación + advertencias seguras + selección fija) y registrar la confirmación del autor sobre esa revisión exacta. Es la base de todo F7/F8: sin revisión congelada no hay invitaciones, respuestas ni finalización.

**Dentro:** proyección compartible (`FrozenOperation`), snapshot inmutable con hash, selección (las 4 combinaciones), sustitución de la revisión anterior sin herencia de respuestas, RPC transaccional de congelar y de confirmar autor, eventos de auditoría, servicios y adapters HTTP mínimos.

**Fuera:** emisión de tokens (`MVP-072`, [f07-02](f07-02-invitaciones-y-respuesta-atomica.md)); cálculo del estado agregado (`MVP-075`, [f07-03](f07-03-estado-agregado-y-pantalla-publica.md)); UI de selección y avance (`MVP-077`, [f07-04](f07-04-ui-autor-seleccion-y-compartir.md)); finalización (F8); generación del borrador y de reportes (F5/F6). No se escriben SQL de esquema base (`MVP-022/023`) ni contratos base (`MVP-021`): se consumen.

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada que debe existir y estar `completada` antes del checkpoint |
| --- | --- | --- |
| `MVP-070` | `MVP-062`, `MVP-023`, `MVP-044`, `MVP-012` | Perfil canónico de serialización y hash del manifiesto/snapshot (`012`, vía [RQ-C3](#8-referencias-a-completar)); advertencias consolidadas con fuentes (`062`); migraciones aplicables desde cero con tablas de borrador/revisión/snapshot/auditoría (`023`); servicio de auditoría append-only (`044`). Contratos `FrozenOperation`, selección, snapshot e IDs/hash de `MVP-021` (dependencia transitiva vía `023`) |
| `MVP-071` | `MVP-070`, `MVP-030` | Revisión congelada (`070`); helper de usuario autenticado y guardas de sesión (`030`) |

**Gate explícito de `MVP-012`:** el maestro lo lista como dependencia de `MVP-070`; no se firma ni se inicia la implementación de `C070-3` (ni se da por cerrada `MVP-070`) mientras el perfil canónico siga solo en diseño, sin decisión documentada. Ver PD-01.

Entrada **no formal** (condición del checkpoint, sin editar el maestro):
- Base Postgres/Supabase **local** operativa (`MVP-023/024`; harness `MVP-120` cuando exista). Sin ella, los checks de BD quedan «no ejecutado», no verdes por doble.

## 3. Requisitos e invariantes aplicables

REQ-08, REQ-12 (selección), REQ-15, REQ-16, REQ-17. INV-03, INV-05, INV-08, INV-11, INV-14, INV-17. Diseño: [SH-01](../../../design/mvp-shared-foundations.md#sh-01--identidades-y-ciclo-de-vida-separados) (revisión ≠ snapshot; constraint compuesta), [SH-02](../../../design/mvp-shared-foundations.md#sh-02--contratos-versionados-y-proyecciones-explícitas) (proyección por allowlist, mismo objeto para autor y terceros), [SH-04](../../../design/mvp-shared-foundations.md#sh-04--autoridad-transaccional-y-respuestas-idempotentes) (unidad atómica, orden de bloqueo, idempotencia).

## 4. Objetivo y aceptación por ID

**`MVP-070` — Congelar revisión.**

- [ ] Existe una proyección del borrador a `FrozenOperation` con advertencias seguras (alias de fuente locales, discrepancia completa necesaria) construida **antes** de congelar y por allowlist estricta Zod; sin chat, evidencias, rutas, URLs firmadas, extractos, IDs internos de fuentes, prompts ni metadatos.
- [ ] El snapshot persistido es completo, inmutable (update/delete rechazados por BD) y con `snapshotId` y `snapshotHash` distintos; el hash cubre la serialización canónica versionada (ver PD-01).
- [ ] La selección se guarda en orden canónico, siempre incluye autor, y solo admite las cuatro combinaciones; cualquier otra se rechaza por contrato y por constraint.
- [ ] Congelar compara `draftRevision` esperado: un borrador cambiado entre vista y congelación devuelve conflicto estable, no congela otra propuesta.
- [ ] Un cambio material o de selección crea otra revisión; la anterior pasa a sustituida, sus invitaciones pendientes quedan sustituidas y **ninguna respuesta se hereda**.
- [ ] Una revisión con claim de finalización vigente no se sustituye (conflicto estable; ver §6.3 y [f08-01](f08-01-finalizacion-durable-y-pdf-canonico.md)).
- [ ] Mismo comando con la misma clave de idempotencia devuelve la revisión ya creada; misma clave con contenido distinto devuelve conflicto.
- [ ] Auditoría de congelar/sustituir en la misma transacción. Advertencias (incluso `critical`) nunca impiden congelar.

**`MVP-071` — Confirmación del autor.**

- [ ] Confirmar requiere sesión válida, propiedad del documento, revisión **activa** y snapshot/hash esperados idénticos a los persistidos.
- [ ] Una sola respuesta del autor por revisión; repetir devuelve la ya persistida; no admite otra decisión. El autor confirma con casilla marcada; el nombre procede de su perfil de sesión, no es autodeclarado (INV-13).
- [ ] Una revisión sustituida no acepta la confirmación (no se revive).
- [ ] Evento de auditoría en la misma transacción. La confirmación del autor no dispara PDF ni HCS (eso es F8).
- [ ] El caso «solo autor» deja la respuesta lista para que `MVP-075` calcule `completa`; este plan no calcula el agregado.

## 5. Rutas, propiedad y fronteras

Todo es del líder; ningún archivo de este plan se delega (superficie sensible, [arquitectura](../../../architecture.md#árbol-objetivo-y-propiedad)). Rutas **propuestas**; los nombres definitivos se fijan al ejecutar sin romper las barreras ([`manifest.mjs`](../../../../tests/boundaries/manifest.mjs)).

| Superficie | Contenido | Barrera |
| --- | --- | --- |
| `src/lib/contracts/` | Solo si falta un esquema de comando/resultado: se **solicita** a `MVP-021`, no se redefine aquí | Sin SDK/React/env |
| `src/lib/documents/revisions/` (propuesta) | Proyección compartible, armado del snapshot, servicio `freezeRevision` y `confirmAsAuthor` | `server-only` (ya exigido para `src/lib/documents`) |
| `src/lib/supabase/` | Adapter que invoca las RPC con el contexto de actor; sin SQL en UI | `server-only` |
| `supabase/migrations/` | Nueva migración con las RPC `freeze_revision` y `confirm_as_author` (nombres provisionales, ver RQ-C2); nunca editar una migración ya aplicada | Líder |
| `src/app/api/documents/[id]/revisions/` (propuesta) | Route Handlers delgados: validar entrada, autorización, llamar servicio, proyectar error estable | Sin reglas de negocio |
| `tests/server/`, `tests/contracts/` | Tests Vitest de servicio, proyección y BD local | Líder |

**DTO.** Entrada: `{ documentId, expectedDraftRevision, selection, idempotencyKey }` y `{ revisionId, expectedSnapshotId, expectedSnapshotHash, checkbox, idempotencyKey }`. Salida: éxito con la revisión/respuesta persistida o error estable (`código, etapa, reintentable, correlación`) según SH-02. Los esquemas son los de `MVP-021`; si divergen, se reporta (§9), no se parcha localmente.

## 6. Pasos ejecutables

Cada checkpoint cierra con checks de §7 y deja el árbol en estado coherente. «Checkpoint» = punto de reanudación interno; no son tareas nuevas del maestro.

### 6.1 `MVP-070`

1. **C070-0 Verificar entrada.** Confirmar en el repo que existen contratos `FrozenOperation`, selección y snapshot (`MVP-021`) y las tablas de `MVP-022/023`. Si falta algo, registrar bloqueo concreto en §9 del maestro (solo esta tarea); continuar lo independiente.
2. **C070-1 Proyección compartible.** Implementar el constructor puro de `FrozenOperation` desde borrador + reportes persistidos: alias locales de fuente («Fuente A…») y tabla privada alias→mensaje/evidencia/página; validar con esquema estricto; rechazar salida de IA que incorpore información ajena a la operación (corregir la proyección, no publicarla). Tests: ningún campo extra, spread/omit prohibido, centinelas de chat/evidencia ausentes, cantidades contradictorias presentes con ambas cifras (PRD §12.15).
3. **C070-2 Selección canónica.** Función pura que normaliza y valida las cuatro combinaciones; orden independiente del orden de clics. Test de las 4 combinaciones y rechazo de las demás.
4. **C070-3 Serialización y hash del snapshot.** Aplicar el perfil de [RQ-C3](#8-referencias-a-completar) (PD-01), precondición `MVP-012`. Hasta que `MVP-012` apruebe el perfil (hoy solo propuesto en `manifest-hcs`), este paso queda pendiente; C070-1/2 y C070-4 pueden prepararse con un hash provisional **solo en tests**, nunca persistido en datos reales.
5. **C070-4 RPC `freeze_revision`.** Definida en el diseño SQL (RQ-C2). Orden de bloqueo estable (documento → revisión activa → invitaciones). En una transacción: propiedad, `draftRevision` esperado, ausencia de claim vigente, inserción de snapshot y revisión, sustitución de la anterior y sus invitaciones, registro de idempotencia y auditoría. Sin llamadas externas dentro del bloqueo.
6. **C070-5 Servicio + Route Handler.** Orquestar proyección → hash → RPC; mapear errores a códigos estables sin filtrar PK privadas ni contenido. Autorización validada en el servidor además de RLS.
7. **C070-6 Tests de BD local.** Ver §7. Incluye casos negativos de inmutabilidad y conflicto.

### 6.2 `MVP-071`

1. **C071-0 Verificar entrada.** `MVP-070` integrada y `MVP-030` expone el usuario autenticado.
2. **C071-1 RPC `confirm_as_author`.** Una transacción: actor = propietario, revisión activa, snapshot/hash exactos, respuesta única (constraint), auditoría. Idempotencia por clave + huella del comando.
3. **C071-2 Servicio + Route Handler.** Validar sesión; rechazar cuerpos con participantes o estado propuestos por el cliente (no se confía en el cliente, INV-03).
4. **C071-3 Tests.** Ver §7.

### 6.3 Interacción con finalización (coordinación)

La RPC de congelar debe rechazar sustituir una revisión con claim de finalización vigente. La tabla de operaciones durables la define `MVP-022/023`/RQ-C2; si al ejecutar este plan aún no existe, [f08-01](f08-01-finalizacion-durable-y-pdf-canonico.md) incorpora la comprobación mediante una **nueva** migración que reemplaza la función, y la prueba de carrera vive allí.

## 7. Validación (ejecución pendiente — no ejecutado)

Ningún check fue ejecutado al redactar este plan. Evidencia por registrar al ejecutar: fecha, comando, resultado real, rama/PR.

| Check | Cobertura | Estado |
| --- | --- | --- |
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` | Proporcionales a contratos/servicios ([desarrollo](../../../development.md#checks-según-el-cambio)); barreras con `server-only` en módulos nuevos | no ejecutado |
| Vitest Node (`tests/server/`): proyección, selección, hash determinista, errores estables | PRD §12.9, 12.11 (parcial), 12.15 | no ejecutado |
| Vitest contra **Postgres/Supabase local real**, conexiones independientes: dos congelaciones concurrentes del mismo borrador (una gana); congelar vs. `draftRevision` obsoleto; sustitución sin herencia; UPDATE/DELETE de snapshot rechazado; usuario B no congela ni confirma el documento de A; confirmar vs. sustituir concurrentes; doble confirmación del autor devuelve la misma respuesta | PRD §12.1, 12.3, 12.11; SH-09 | no ejecutado |
| `npm run build` | Solo si se tocan rutas o configuración | no ejecutado |
| Playwright | No aplica en este plan: no hay UI propia (ver [f07-04](f07-04-ui-autor-seleccion-y-compartir.md)) | no aplica |

Las pruebas concurrentes **no** usan dobles que simulen la base. Si Docker/Supabase local no está disponible en la máquina, el check queda «no ejecutado» y la tarea no pasa a `completada`.

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C1 | [`review-confirmation`](../../../specs/review-confirmation.md) | Texto exacto del contenido compartible permitido; semántica de «cambio material»; estados del agregado y su relación con el estado de documento; si el autor muestra casilla propia; qué hace el autor que no quiere confirmar (el PRD no define rechazo del autor) |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | Tablas de revisión/snapshot/respuesta/operación; nombres y firmas de RPC; permisos mínimos y `search_path`; orden de bloqueo; tabla de idempotencia; transición de abandono de claim |
| RQ-C3 | [`manifest-hcs`](../../../design/manifest-hcs.md) | Perfil canónico (codificación, orden, números, nulos, Unicode, colecciones) y vectores de prueba, aplicable al snapshot |

## 9. Decisiones pendientes y desviaciones

- **PD-01 — Perfil canónico del snapshot.** `MVP-070` depende de `MVP-012` en el maestro y SH-03 exige aplicar el mismo perfil versionado al snapshot. El diseño [manifest-hcs](../../../design/manifest-hcs.md) ya propone un perfil v1 (RFC 8785/JCS) con vectores, pero es **propuesto, no aprobado**: sin la aprobación y los vectores de dominio registrados por `MVP-012` no puede persistirse un `snapshotHash` real y no se firma la implementación de F1 por documentación; no se inventa un perfil local. El gate es `MVP-012` (RQ-C3), no una contradicción técnica.
- **PD-02 — Rechazo del autor.** El PRD solo define rechazo para terceros y [review-confirmation §4](../../../specs/review-confirmation.md) fija el mínimo P0 del autor que no acepta (no confirmar, seguir conversando, preparar otra revisión). No se implementa decisión «rechazar» del autor; solo si se solicita esa opción extra habría que definir su efecto (RQ-C1).
- **PD-03 — Definición de «cambio material».** El servidor decide por comparación de snapshot/selección, no por IA (SH-01); el criterio base está en [review-confirmation §2](../../../specs/review-confirmation.md). Si hace falta criterio adicional, RQ-C1.

### 9.1 Corrección de cierre — alcance de documento en la confirmación del autor

Hallazgo de auditoría: `confirm_as_author` no comprobaba que la revisión perteneciera al documento de la ruta. Corregido con la migración aditiva `20261016002100_confirm_document_scope.sql` (nueva firma con `p_document_id`, validación atómica en SQL, sobrecarga anterior eliminada; propietario `galcoa_f7_writer` y `execute` solo para `authenticated`), el adaptador y el servicio. Ruta de otro documento, usuario ajeno e inexistente devuelven el mismo `NOT_AVAILABLE`. Plan global: [mvp-consolidated-closure](../mvp-consolidated-closure.md), etapa A.

Evidencia: `typecheck`, ESLint de los archivos tocados, `test:boundaries` y Vitest de `tests/server/revisions` e `invitations` en verde (62 pruebas). **No ejecutado:** las pruebas con Supabase local (`tests/server/local/review-confirmation.test.ts`, catálogo RLS) por no contar con reserva de la base; quedan para el CI de GitHub. Esto no cierra MVP-070/071/077/078 por el resto de la brecha de finalización.

### 9.2 Corrección de cierre — lectura congelada con reportes discriminados (etapa B)

`get_freeze_source` elegía el último reporte con `output.draftRevision` igual a la revisión, sin distinguir tipo. La migración aditiva `20261016002503_freeze_warning_sources.sql` reemplaza la función (misma firma, propietario y grants; sin tablas ni RPC nuevas) y lee por separado: el **contraste** vigente (`kind = 'contraste'` v1 con el mismo `draftId`, revisión **y contenido** del borrador, o el formato histórico sin `kind`, compatibilidad explícita que solo compara la revisión) y la **redacción** vigente (`kind = 'redaccion'` v1 con `publishedDraftRevision` = revisión y cuyo id figura en `drafts.source_refs`). Otra revisión, otro contenido, `kind` o versión desconocidos son irrelevantes y se ignoran. **Candidato ≠ válido:** el candidato vigente se identifica por tipo, versión y revisión/borrador exactos antes de validar su forma; si está corrupto (`result` fuera del enum, `findings`/`warnings` no son lista) se devuelve sin normalizar y el adaptador lo rechaza con `Respuesta de persistencia inválida` (el servicio responde `TECHNICAL_FAILURE`): no se congela omitiéndolo ni se rellena con uno más viejo. No es un bloqueo por severidad: una advertencia crítica válida sigue sin bloquear. El reemplazo corre con delegación temporal de `galcoa_f7_writer` (set true + CREATE en `public`, restaurados a `set false, inherit false` y sin CREATE), como 02100; conserva propietario, firma y grants. Nueva clave `agent1` ({warnings, refs}); `report` y `refs` conservan su forma.

El adaptador (`src/lib/documents/revisions/freeze-source.ts`) unifica los refs por fuente real (tipo + id), de modo que el mismo `m1` de dos reportes no se mezcla, y consolida Agente 1 + Agente 2 con `consolidateWarnings`; el estado de control sale de `controlStatus` (una advertencia de la redacción sube el estado, pero la redacción sola no equivale a un contraste: sin contraste ni reglas queda `sin_evaluar`). **Reglas deterministas: no se ejecutan ni se afirman.** Las funciones sí existen (`lateUpload`, `retroactiveBatch`, `repeatedValues` en `src/lib/rules/indicators.ts`; `ruleWarnings` en `src/lib/rules/consolidate.ts`); falta la orquestación que las invoque con insumos reales y los umbrales aprobados (MVP-013), y que registre la versión ejecutada. Hasta entonces `rulesEvaluated = false` es la señal honesta: no afirma ausencia de motor y no cierra ningún REQ. Refs sin fuente resoluble se descartan del `sources` y del texto («fuente no identificada») sin perder la advertencia.

Evidencia: Vitest de `tests/server/revisions` y `rules` (66 pruebas, incluidas 8 nuevas de `freeze-source.test.ts`), ESLint de los archivos tocados y `typecheck`. **No ejecutado:** `tests/server/local/freeze-warning-sources.test.ts` y el catálogo RLS contra Supabase local (sin reserva de la base); los validará el CI aislado. Nada de esto acredita el flujo de chat de extremo a extremo.

## 10. Rollback y recuperación

- **Antes de integrar:** descartar la rama; sin remoto no hay otra consecuencia. La base local se recrea desde cero con las migraciones.
- **Migración nueva aún local:** eliminar el archivo y recrear la base local. **Migración ya aplicada en un entorno compartido (`MVP-026`):** nunca editarla; corregir con una migración posterior.
- **Tras integrar:** revertir el commit del servicio y publicar una migración correctiva que retire o reemplace las RPC; las revisiones y snapshots ya persistidos **no se borran** (INV-05, INV-08): se dejan sin uso.
- **Recuperación operativa:** una congelación abortada deja la revisión anterior intacta (transacción). Un reintento con la misma clave de idempotencia es seguro. Un fallo de red del cliente no implica fallo del servidor: consultar la revisión persistida antes de repetir.

## 11. Cierre

Al completar la implementación **e integrarla en la base del equipo** con evidencia real: actualizar solo las filas `MVP-070` y `MVP-071` del maestro (estado, enlace a este plan, evidencia) y la tabla de progreso del §3, en la misma edición. Archivar este plan en `completed/` al cerrar ambas y conservar los enlaces. Documentar este plan no marca ninguna tarea. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)

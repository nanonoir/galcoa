# F4 — Documentos, mensajes persistentes y auditoría solo-agregar

Tareas del maestro: `MVP-040`, `MVP-041`, `MVP-044`

**Estado: servicios implementados con dobles (2026-10-16, Gastón por delegación de Nahuel, Issue #10, opción B).** Hechos: puertos de sesión y persistencia, servicios de documentos, mensajes y auditoría y 23 tests con un doble en memoria (`tests/server/documents/`). **Pendientes:** adaptador Supabase con RPC atómicas `create_document`/`append_message` (migración aditiva F4, después de MVP-025), conexión del helper de sesión de MVP-030, Route Handlers y prueba en base local real (UPDATE/DELETE de eventos rechazados). Ninguna tarea se marca completada hasta entonces. Fuentes: [maestro](../mvp-master-plan.md) (IDs, dependencias y evidencia), [PRD v1.5](../../GALCOA-PRD-v1.4.md), [fundaciones compartidas](../../../design/mvp-shared-foundations.md) (`SH-01`, `SH-02`, `SH-03`, `SH-04`, `SH-07`), [arquitectura](../../../architecture.md) y [desarrollo](../../../development.md). Este plan no repite esos documentos: los referencia.

## 1. Objetivo y estado de partida

### Conexión autorizada — 2026-10-16 (`flow/persistence-wiring`)

Secuencia coordinada de #10/#11/#13/#14/#15 (sin duplicar planes): primero RPC,
adaptador y HTTP de documentos/mensajes; después reservas/Storage/extracción;
finalmente CAS de borrador, reportes y claim durable del turno. Se conservan los
servicios puros. Migración reservada: `20261016001000_f4_persistence.sql`, sin
editar C1–C4. Auth y `src/lib/supabase/**` pertenecen a la sesión #9; no se editan.
La base local está reservada por esa sesión: no arrancar/resetear/parar Docker ni
afirmar validación SQL real. Cada checkpoint se entrega parcial con `Refs`, sin
automerge ni cierre de IDs. Los IDs permanecen `en_curso` hasta evidencia real.

Checkpoint #10: las RPC de autor derivan identidad de `auth.uid()`; nunca del
body. El canal de agente/auditoría interna queda limitado a `galcoa_executor`,
sin grants directos a tablas ni uso de `service_role`. Su composición depende
del transporte acotado de MVP-025, aún ausente en esta base. No se sustituye con
el cliente privilegiado actual. Pruebas de contratos con dobles no acreditan
aislamiento, atomicidad ni concurrencia en Postgres.

Entrega de #10 en dos PR encadenados, sin merge automático: primero migración,
adaptador y tests de persistencia (`flow/persistence-core`, base `develop`);
después composición y HTTP (`flow/persistence-wiring`, base del primero).
El contrato HTTP siguiente corresponde al segundo PR: no se declara disponible
al integrar únicamente el núcleo. El segundo se retargetea a `develop` después
del merge del primero, conservando ancestros y verificando su diff.

Crear el servicio de documentos del propietario (crear, listar, reabrir), conservar los mensajes originales del chat con fecha real de carga y fecha declarada separadas, y ofrecer el servicio de auditoría solo-agregar que emiten las demás tareas.

**Estado de partida de esta conexión:** contratos, servicios puros, Auth y C1–C4 ya integrados; faltaban RPC/adaptadores/rutas. El checkpoint #10 agrega esos archivos, sin dar por verificadas su aplicación SQL ni las carreras reales hasta ejecutar la suite local con reserva. El transporte del ejecutor sigue pendiente en MVP-025; las rutas de autor no lo necesitan.

### Contrato HTTP del checkpoint #10 (consumidor #16)

Todos los endpoints son privados, `Cache-Control: private, no-store, max-age=0`.
POST requiere `Content-Type: application/json`, `Origin` exactamente igual al
lista de orígenes de `NEXT_PUBLIC_APP_URL` configurada (helper de Auth #70 ya
integrado; no se deriva del Host del request),
sesión verificada y body estricto de hasta 64 KiB de transporte. No se admite
`ownerId`, `sender`, fechas de carga ni IDs de documento en el body.

| Método/ruta | Body | `result` del éxito |
| --- | --- | --- |
| `GET /api/documents` | ninguno | `DocumentSummary[]` |
| `POST /api/documents` | `{title, idempotencyKey}` (`CreateDocumentCommandSchema`) | `DocumentSummary` |
| `GET /api/documents/[id]` | ninguno | `DocumentSummary` |
| `GET /api/documents/[id]/messages` | ninguno | `Message[]`, orden de secuencia SQL |
| `POST /api/documents/[id]/messages` | `{content, declaredEventDate, idempotencyKey}` (`RecordMessageCommandSchema` sin `documentId`) | `Message` del autor |

Éxito HTTP 200: `{schemaVersion:1, outcome:"completed", result, replayed?}`;
`replayed` solo acompaña escrituras. Error: `{error: TechnicalError}`, igual al
handler de turnos existente. Estados: entrada inválida 400, sin sesión 401,
origen rechazado 403, ajeno/inexistente/UUID inválido 404, clave divergente 409,
body excesivo 413, fallo técnico reintentable 503. El texto original no se
recorta. Se conserva `declaredEventDate` según el contrato, sin inferir zona.

El cliente debe conservar la misma `idempotencyKey` al reintentar el mismo
mensaje. Esta ruta de mensajes **no** genera IA ni sustituye el turno de chat:
`clientMessageId`, cancelación y NDJSON siguen siendo el contrato de
`turns/http.ts`, aún sin ruta productiva conectada en este checkpoint. Rutas de
evidencia/extracción/contraste se documentarán en sus checkpoints, no se anuncian
como disponibles por existir servicios con dobles.

RPC de autor: `create_document`, `append_message`, `list_documents`,
`get_document`, `list_messages`; identidad derivada de `auth.uid()`, sin DML
directo. `append_agent_message` y `append_document_audit` son solo ejecutor.
Los fingerprints SQL se derivan de los campos semánticos en la función: no se
acepta un fingerprint aportado por el cliente como prueba de equivalencia.
El rol no-login `galcoa_f4_writer` posee solo las funciones F4 y permisos sobre
sus tablas/columnas necesarias; no se otorga membresía al ejecutor/API ni
`BYPASSRLS`, propiedad de tablas o DML general a `galcoa_executor`.

Prueba real preparada (no ejecutar hasta obtener reserva):
`npx.cmd vitest run --config tests/server/persistence/vitest.local.config.ts`.
Reutiliza setup y conexiones independientes de `tests/server/rls/`; el setup
resetea la pila salvo `RLS_SKIP_RESET=1`, por eso no se invoca en paralelo a Auth.
Incluye dos propietarios/anon, idempotencia concurrente, auditoría atómica ante
fallo forzado, grants, canal de agente y rechazo de UPDATE/DELETE. No cubre aún
cuotas de evidencias ni claims de turnos: pertenecen a los checkpoints pendientes.

**Evidencia del checkpoint completo (2026-10-16, base `dc2ccb2` con Auth #70):**
`npx.cmd vitest run --project server --project boundaries` **612/612**;
31 son tests nuevos de adapter/HTTP con dobles. ESLint focalizado en los archivos
del checkpoint: exit 0. `next typegen` + `tsc --noEmit`: exit 0 antes de actualizar
la base; `npm.cmd run build` repetido sobre la base actual: exit 0, incluidas las
tres rutas documentales. `env:check` del prebuild pasó sin leer archivos de
entorno. **No ejecutado:** suite Postgres real, smoke HTTP con sesión real ni
llamadas de IA/Storage. Autorrevisión de grants, separación de canales, origen
confiable y diff; revisión independiente aún pendiente. `npm ci` reportó nueve
vulnerabilidades altas preexistentes; no se cambiaron dependencias ni lockfile.

## 2. Criterios del PRD y requisitos cubiertos

| Tarea | REQ / INV / PRD | Aceptación del maestro (resumen) |
| --- | --- | --- |
| `MVP-040` | REQ-02, REQ-01 (aislamiento), INV-11; PRD §12.1 | Crear, listar y reabrir del propietario; estados persistidos; acceso ajeno denegado con test |
| `MVP-041` | REQ-03, INV-09; PRD §12.2 (persistencia) | Mensajes originales conservados entre sesiones; fecha real de carga del servidor y fecha declarada del hecho por separado |
| `MVP-044` | REQ-15, INV-08 | Servicio de eventos críticos sin update/delete; las tareas posteriores emiten sus eventos |

## 3. Dependencias

**Entrada (checkpoints por ID, no por plan):**

| Para | Requiere `completada` en el maestro |
| --- | --- |
| `MVP-040` | `MVP-020` (contratos núcleo), `MVP-024` (RLS y buckets, base local), `MVP-030` (sesión y helper de usuario) |
| `MVP-041` | `MVP-040` |
| `MVP-044` | `MVP-023` (migraciones, incluido append-only a nivel de base) y `MVP-040` |

Orden interno: `040` → `041` y `040` → `044`; `041` y `044` son independientes entre sí.

**Salida (quién consume qué):** `MVP-042` y `MVP-051` consumen `MVP-041`; `MVP-052`, `MVP-070`, y los eventos de todas las tareas posteriores consumen `MVP-044`; `MVP-054` y `MVP-116` consumen `MVP-040`.

Este plan no depende de ningún plan de F5/F6.

## 4. Decisiones y límites

- **Contratos `MVP-020/021` y esquema `MVP-022/023`: base compartida, no se reabren aquí.** Este plan consume los esquemas de documento, mensaje y evento. Si falta un campo, se registra como solicitud (§10), no se redefine localmente.
- **Pendiente `MVP-013`:** límite de longitud de un mensaje de chat y tiempos máximos. Hasta que exista el documento consumidor, se usa una constante configurable etiquetada «default propuesto, no aprobado»; el valor no se presenta como decidido.
- **Estados persistidos ≠ estados derivados.** `MVP-040` persiste y devuelve las dimensiones que guarda el contrato (`SH-03`); no deriva «aprobado» ni recalcula dimensiones: eso lo hará el motor de `MVP-060`. Los valores iniciales de un documento nuevo son los que fije `MVP-020/022`.
- **Autorización:** cada operación valida sesión y propiedad en el servidor además de RLS (`SH-07`). Un documento ajeno responde igual que uno inexistente (opción técnica local para no revelar existencia; se confirma al implementar).

## 5. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido en este plan |
| --- | --- | --- |
| `src/lib/documents/` | Servicios de documento, mensajes y auditoría (`import "server-only"`; carpeta ya incluida en `SERVER_DIRS`) | Lógica de revisión, finalización, PDF (otros planes) |
| `src/lib/supabase/` | Adaptadores de persistencia mínimos que falten (clientes: `MVP-025`) | Cliente de navegador; relajar `SERVER_DIRS` |
| `src/lib/contracts/` | Solo si `MVP-020/021` quedó sin un campo y el líder lo autoriza como ajuste mínimo | Redefinir enums o `schemaVersion` |
| `src/app/api/` | Route Handlers delgados de documentos y mensajes (propuestos abajo) | Endpoints de otros dominios |
| `tests/server/`, `tests/contracts/` | Casos de servicio con dobles | Fixtures dentro de código de producto |
| `src/features/*/components/` | Nada: sin trabajo de presentación ni delegación | Todo |

Los endpoints son **propuestas locales** (confirmar al implementar, sin contradecir `SH-07`): `POST /api/documents`, `GET /api/documents/[id]/messages`, `POST /api/documents/[id]/messages`. Listar y reabrir lo consumen Server Components llamando al servicio directamente. Antes de escribir Route Handlers, leer la guía local `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` y `03-api-reference/03-file-conventions/route.md`.

## 6. Pasos

### 6.1 MVP-040 — Servicio de documentos

- [ ] Leer la fila `MVP-040`, verificar dependencias en el maestro y las guías locales de Next citadas.
- [ ] Servicio `createDocument`, `listDocuments`, `getDocument` en `src/lib/documents/`, con el helper de usuario autenticado de `MVP-030`; entrada y salida validadas con los esquemas de `MVP-020`.
- [ ] Adaptador que proyecta el registro persistido a `DocumentSummarySchema` (el dashboard sigue consumiendo ese contrato sin `schemaVersion` retroactivo, `SH-02`). `confirmationStatus`, `revisionId` y `snapshotId` son `null` mientras no haya revisión.
- [ ] Route Handler de creación (validación, llamada al servicio, proyección de errores).
- [ ] Cada creación emite su evento mediante `MVP-044` cuando este exista; si `040` se integra antes, dejar el punto de emisión documentado y no inventar un registro paralelo.

### 6.2 MVP-041 — Mensajes persistentes

- [ ] Servicio `recordUserMessage` / `listMessages`: texto original inmutable, orden estable por secuencia de servidor, autor, `createdAt` del servidor (UTC `Z`) y fecha declarada del hecho **como campo propio**: texto original, precisión y zona declaradas; nunca la fecha de carga como sustituto ni medianoche UTC inferida (`SH-03`, INV-09).
- [ ] Clave de idempotencia acotada a actor/documento/acción con fingerprint del comando (`SH-04`): mismo comando devuelve el mensaje persistido; misma clave con contenido distinto devuelve conflicto.
- [ ] Puerto de escritura para mensajes del asistente que usará `MVP-052`; este plan solo lo define y prueba con dobles. Si el esquema (`MVP-020`) no contempla mensajes del asistente, se registra como solicitud (§10).
- [ ] Mensajes originales no se editan ni borran; las correcciones o borradores se referencian por identificadores (borrador/reporte), nunca se reescribe el original (`SH-01`, `SH-08`).
- [ ] Route Handlers de lectura y escritura de mensajes.

### 6.3 MVP-044 — Auditoría solo-agregar

- [ ] Servicio `appendAuditEvent` sin operación de actualización o borrado en su superficie; catálogo cerrado de tipos de evento con esquema Zod del payload, versionado.
- [ ] Catálogo inicial mínimo (`document.created`, `message.recorded`); cada tarea posterior agrega sus tipos al consumirlo. No se prescriben tipos de F7–F9.
- [ ] Payloads sin secretos, sin contenido privado ni prompts crudos; solo identificadores, tipo y correlación no sensible.
- [ ] Idempotencia del evento por clave de operación (un reintento no duplica); los eventos de mutaciones transaccionales (`SH-04`) los escribe la misma RPC, y este servicio cubre los no transaccionales.
- [ ] Documentar en el propio servicio la regla de retención/eliminación legalmente necesaria de INV-08 sin inventar un plazo.

## 7. Casos de test por aceptación

| Aceptación | Caso | Nivel |
| --- | --- | --- |
| `MVP-040` | Crear devuelve documento propio; listar devuelve solo los del usuario; reabrir un documento propio recupera su estado persistido | Vitest Node, servicio con doble de persistencia |
| `MVP-040` | Sin sesión: rechazo; usuario B pide documento de A: denegado sin revelar existencia (PRD §12.1) | Vitest Node, y base local real si está disponible |
| `MVP-040` | Resumen proyectado valida contra `DocumentSummarySchema`; sin revisión, `confirmationStatus`/`revisionId`/`snapshotId` son `null` | Contrato |
| `MVP-041` | Mensajes persisten entre sesiones (cierre y nueva lectura devuelven los mismos) (PRD §12.2) | Servicio + base local real si está disponible |
| `MVP-041` | Fecha de carga la fija el servidor aunque el cliente envíe otra; fecha declarada se conserva aparte; fecha sin zona no se normaliza a UTC (INV-09) | Contrato / servicio |
| `MVP-041` | Mismo comando repetido: un mensaje; misma clave con texto distinto: conflicto | Servicio |
| `MVP-044` | Superficie sin update/delete; payload inválido o con campos no permitidos rechazado; reintento no duplica | Servicio |
| `MVP-044` | Intento de `UPDATE`/`DELETE` sobre eventos falla en base real local | Base local real (requiere `MVP-023`); si no se puede ejecutar, queda como «no verificado» |

Las pruebas con RLS real de dos usuarios pertenecen a `MVP-024` y `MVP-121`; este plan no las sustituye.

## 8. Validación, evidencia y rollback

Checks al ejecutar (`development.md`, «Checks según el cambio»): `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`; `npm run build` por haber rutas. **Evidencia actual: no ejecutado.** Si falla la base local o un servicio real, la tarea no se marca completada ni se simula con un mock en producción; el resultado queda como fallo explícito con la causa. Rollback: revertir los archivos del plan en su rama; las migraciones no pertenecen a este plan (`MVP-023`).

**Credenciales y secretos:** no se leen `.env`/`.env.local` ni se imprimen valores; no se llama a Supabase remoto. Las pruebas reales usan la base local con claves efímeras (`SH-09`).

## 9. Cierre

La fila de cada ID se actualiza en el maestro solo tras integrar y repetir checks (§8 del maestro), con evidencia real; escribir este documento no marca ninguna tarea. Al cerrar: actualizar solo las filas `MVP-040`, `MVP-041`, `MVP-044` y el recuento del §3 del maestro, y archivar este plan en `completed/` conservando el enlace. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 10. Pendientes y solicitudes

**Referencias** (documentos objetivo ya disponibles; los parámetros operativos siguen pendientes de F1):

- `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md): fuentes admitidas y límite de longitud de mensaje; el valor aprobado es de `MVP-013` (§7 de la spec, propuesto, no aprobado).
- `RQ-B2` — [data-transactions](../../../design/data-transactions.md): modelo de escrituras, secuencia por documento, claves de idempotencia, comandos y eventos de auditoría atómicos; si incluye mensajes del asistente, se resuelve con ese diseño y `MVP-020/022`.

**Solicitudes a otros grupos:** (a) `MVP-020`: confirmar campos de documento, mensaje (rol, fecha declarada con precisión/zona), forma de errores estables y catálogo de eventos; (b) `MVP-022/023`: secuencia por documento, unicidad de idempotencia y trigger append-only de auditoría; (c) `MVP-030`: nombre y firma del helper de usuario autenticado.

**Decisiones pendientes:** ninguna que impida avanzar; los valores de `MVP-013` quedan como defaults propuestos no aprobados.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Fundaciones](../../../design/mvp-shared-foundations.md)

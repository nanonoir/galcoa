# Persistencia, transacciones y recuperación del MVP

**Diseño objetivo; solo documentación, sin migraciones ni integración comprobada.** Resuelve RQ-A1/A4, RQ-B2, RQ-C2 y las costuras de pruebas de F12. Complementa [SH-01…09](mvp-shared-foundations.md), el [PRD §5–9 y §12](../exec-plans/GALCOA-PRD-v1.4.md) y la [arquitectura](../architecture.md). No cierra `MVP-010…013`, ni cambia requisitos, estados o dependencias del [maestro](../exec-plans/active/mvp-master-plan.md).

La autoridad de una transición es **una transacción SQL**, no una secuencia de llamadas desde JavaScript. El servidor prepara y verifica artefactos fuera de los locks; SQL comprueba permisos, identidad de entrada, concurrencia y publicación. Una advertencia, incluso crítica, no es precondición negativa.

## 1. Modelo y propiedad de las escrituras

Nombres de tablas y RPC son el contrato objetivo que `MVP-020/021/022` debe reflejar; no DDL listo para aplicar. UUID internos, secuencias por documento y referencias públicas son identidades diferentes. Tiempos del servidor: `timestamptz`; fechas declaradas: texto, precisión y zona originales separados. No hay borrado en cascada de historia finalizada.

| Tabla | Contenido / restricciones relevantes |
| --- | --- |
| `documents` | `id`, `owner_id`, `active_revision_id`, `last_version_id`, contadores de mensaje/revisión/versión. Punteros compuestos al mismo documento. Es la fila raíz de exclusión. |
| `messages` | Original privado, emisor, fecha real de carga, fecha declarada y `sequence`. `UNIQUE(document_id, sequence)`; original append-only. Corrección/cancelación agrega evento o nuevo mensaje, no reescribe el original. Estado de streaming separado del mensaje original aceptado. |
| `message_events` | Metadatos append-only de turnos, cancelaciones, errores y procedencia; vínculo al mensaje original. No guardar tokens ni prompts secretos. |
| `evidences`, `evidence_extractions` | Original privado: hash de bytes, longitud, tipo y clave privada reservada; extracción separada por ejecución, método/modelo, páginas/regiones, limitaciones, fuentes y resultado. Otra extracción crea otra fila. |
| `drafts` | Una propuesta activa por documento, `draft_revision` creciente y referencias a mensajes/extracciones/reportes exactos. Única superficie de operación mutable; escritura CAS sobre revisión esperada. |
| `verification_reports`, `report_sources` | Reporte histórico privado append-only: entradas exactas, salida validada, modelo/prompt/reglas, instante, limitaciones y fuentes privadas tipadas. Nuevas evaluaciones no actualizan reportes asociados a versiones. |
| `document_revisions` | `id`, documento, `sequence`, snapshot único, estado de ciclo de vida, agregado de confirmación. `UNIQUE(document_id, sequence)`; selección y snapshot no editables. |
| `revision_snapshots` | `id`, documento/revisión, `schema_version`, bytes canónicos, hash y JSON compartible completo. Relación 1:1 con revisión; bytes/JSON/hash inmutables y concordantes. Hash no es permiso de lectura. |
| `revision_participants` | Filas fijas por revisión y rol `autor/intermediario/comprador`; siempre autor, terceros según una de las cuatro selecciones. `UNIQUE(revision_id, role)`; autor enlaza al propietario, no a un nombre del request. |
| `snapshot_sources` | Mapeo **privado** de alias compartibles a mensajes/evidencias/páginas/reportes. El snapshot no contiene esas PK ni URLs. |
| `corroboration_requests` | Capacidad individual: participante, revisión/snapshot/hash, `token_hash` único, generación, vencimiento, revocación, consumo/sustitución. Una generación vigente por participante; historial de generaciones conservado. |
| `corroboration_responses` | Respuestas de autor y terceros: identidad compuesta, decisión, casilla, ratificación, nombre declarado del tercero y tiempo SQL. Una por participante/revisión; `request_id` único cuando es tercero. No se cambia una decisión. |
| `idempotency_records` | `actor_scope`, `resource_id`, `action`, `key`, fingerprint, resultado persistido seguro. `UNIQUE(actor_scope, resource_id, action, key)`; no token en claro ni bytes privados en resultado público. |
| `finalization_operations` | Una por revisión: reserva de `version_id`, número/antecedente, entradas, renderer, referencia pública y nonce privados persistidos, fase, lease, fencing, error seguro. Registro técnico **no final**, excluido del historial de versiones. |
| `artifact_staging`, `artifact_reservations` | Bytes PDF canónicos `bytea`, hash calculado sobre bytes, longitud y entradas; unicidad por operación/tipo. Reserva de objeto privado por operación/fencing. No aceptar bytes sin claim vigente. |
| `document_versions`, `version_artifacts` | Solo registros publicados: revisión única, número, antecedente, snapshot, constancias, PDF/manifiesto privados, envelope público y hashes. Inmutables. `UNIQUE(document_id, version_number)`, `UNIQUE(revision_id)` y sucesor único de cada antecedente; índice especial para un único primer elemento por documento. |
| `hedera_attempts`, `hedera_registrations` | Intentos técnicos separados de versión: intención, payload opaco exacto, bytes firmados privados, transacción, ventana, claim/fencing y observaciones. Un intento activo por versión; registro probado único por versión, con referencias de red/topic/época, secuencia y consenso inmutables. Véase [manifiesto/HCS](manifest-hcs.md). |
| `audit_events` | Acción crítica, actor acotado, documento/recurso, resultado y tiempo SQL; append-only, datos mínimos. No snapshot completo, token, claves, bytes firmados ni contenido de proveedores en logs. |

FK compuestas desde participantes, solicitudes, respuestas y versiones incluyen `document_id, revision_id, snapshot_id, snapshot_hash` donde corresponda. No basta comprobar cuatro UUID por separado. La selección fija se impone por constraints más trigger diferido de conjunto (autor obligatorio, roles sin duplicados, solo cuatro combinaciones); una respuesta referencia un participante existente. Revisión/snapshot pueden insertarse con referencias diferidas dentro de la misma transacción; nunca quedan huérfanos al commit.

`document_versions` no admite filas provisionales: la reserva vive en `finalization_operations`. La última versión se resuelve y reserva **bajo lock del documento al reclamar**, no al congelar. Evita bifurcar v2/v3 desde un antecedente viejo. No reutilizar números de reservas abandonadas como identificadores ya entregados; los números publicados pueden tener huecos, el orden y el antecedente son autoritativos.

## 2. Límites SQL, RLS y Storage

### Roles y canales

| Canal | Permiso efectivo |
| --- | --- |
| Autor con sesión Supabase | Lecturas privadas RLS por `auth.uid() = documents.owner_id`; RPC de acciones de autor revalida sesión/propiedad dentro de SQL. No DML directo sobre snapshots, respuestas, auditoría, staging o versiones. |
| Tercero sin sesión | `anon` sin SELECT/DML sobre tablas privadas. Solo RPC específicas de lectura/respuesta por hash de capacidad; función comprueba token, tiempo, estado y snapshot. Conocer un UUID no autoriza nada. |
| Verificador público | RPC de lectura por referencia opaca devuelve allowlist de envelope/estado/localizadores; ninguna vista general de versiones ni acceso a Storage. |
| Ejecutor de servidor | Rol SQL dedicado, sin propiedad de tablas, `BYPASSRLS`, superusuario ni DML general; solo `EXECUTE` de funciones internas enumeradas y acceso a staging por funciones. Credencial de conexión exclusivamente servidor, no `service_role` como bypass universal. |

Las funciones internas que aceptan `actorUserId` solo son ejecutables por ese ejecutor, tras validación de sesión por el servicio; vuelven a comprobar propiedad y alcance del recurso. `anon`/`authenticated` no pueden invocarlas ni adquirir ese rol. Las RPC de autor no aceptan `actorUserId` sustituyendo a `auth.uid()`. El adapter SQL interno en `src/lib/supabase/` es responsabilidad de `MVP-025`: conexión acotada y transacciones cortas, nunca SQL desde rutas/UI. La biblioteca/conectividad del rol dedicado y su aprovisionamiento deben comprobarse en `MVP-025/026/132`; **no se presupone una credencial ya existente**, ni se prescribe aquí una API de driver no consultada. Es un objetivo técnico de permisos mínimos pendiente de provisión, no una nueva puerta de autenticación de producto ni autorización para leer/agregar secretos durante esta preparación.

Usar `SECURITY INVOKER` si basta. Para RPC privilegiadas: owner no-login de privilegios mínimos por dominio, `SECURITY DEFINER SET search_path = ''`, nombres de objetos cualificados, sin SQL dinámico desde entrada. Revocar `EXECUTE` de `PUBLIC` y permisos por defecto; conceder firmas exactas solo al canal de la tabla anterior. Las funciones auxiliares no se exponen como RPC. Triggers de inmutabilidad también aplican al rol ejecutor; no concederle capacidad de deshabilitarlos. Catálogo de grants/RLS y llamadas directas hostiles forman parte de los tests.

**Capacidad pública:** el servidor hashea el token, valida formato y limita abuso; SQL vuelve a resolver/revalidar el hash atómicamente. Un hash de token también es una capacidad de escritura para esa RPC: no devolverlo ni registrarlo. Las funciones públicas son deliberadamente estrechas; no reciben nombres de tabla, propietario, rutas, filtros libres ni comandos SQL. Como una RPC `anon` es accesible sin pasar por Next, el presupuesto de abuso de capacidad también debe imponerse en SQL, no solo en el handler (`MVP-011/075`). No desplegarla sin ese control.

### Objetos privados

Buckets objetivo `evidences-private` y `versions-private`, no públicos. Ruta reservada opaca por documento/artefacto, nunca nombre de archivo aportado. La autorización se consulta en tablas de propietario/reserva; **el prefijo no prueba propiedad**.

- Evidencia: INSERT solo en reserva propia vigente, sin overwrite. Lectura/listado solo propietario. Tras aceptación del original, impedir UPDATE/DELETE por roles de aplicación.
- PDF: INSERT solo propietario en reserva técnica vigente creada por el ejecutor; sin UPDATE/DELETE ni `upsert`. El propietario no puede reservar otra ruta ni publicar una versión mediante Storage. El servidor lee y compara hash/longitud con staging antes de adoptar: una subida manipulada causa conflicto, no una versión falsa.
- La vigencia/fencing se comprueba en la política de INSERT; un upload ya iniciado puede acabar después de expirar el claim. Por eso cada nuevo fencing obtiene **otro nombre de objeto** y la adopción/publicación SQL exige la reserva y fencing actuales. Un trabajador viejo solo puede dejar un huérfano, no sobrescribir el objeto ganador.
- Lecturas del PDF publicado: propietario con sesión o URL firmada breve emitida tras autorización. Tercero/verificador no reciben URL firmada del original. No cachear datos privados entre usuarios.

## 3. Locks, idempotencia y agregado indivisible

**Orden común para todas las mutaciones:** documento → borrador (si se usa) → revisiones por ID → participantes por rol fijo → solicitudes por ID → operación de finalización → intento HCS → reserva/staging → registro de idempotencia. Cada categoría omitida no cambia el orden. Resolver token/recurso sin lock solo sirve para encontrar el documento; revalidarlo después de obtener los locks. Nunca bloquear primero el token y después el documento. Las lecturas públicas son proyecciones consistentes de una sentencia/transacción, sin `FOR UPDATE` ni consumo.

El lock de documento serializa las transiciones de ese documento; no red, render ni upload bajo lock. Un token confirmado mientras otro request sustituye la revisión se ordena por ese lock: gana la respuesta **antes** de sustituir, o se rechaza por sustituida; nunca revive una revisión. Igual orden para confirmar autor, revocar, reclamar y publicar.

Cada acción repetible tiene clave acotada y fingerprint SHA-256 del comando canónico versionado. Incluye referencias esperadas y campos semánticos, no timestamps de transporte, sesión, token en claro ni clave de idempotencia. `actor_scope` es usuario autenticado o participante/invitación resueltos desde capacidad, nunca texto del cliente. Bajo lock se consulta/inserta la unicidad; mismo fingerprint devuelve el resultado persistido, otro da `IDEMPOTENCY_CONFLICT`. Un rollback no deja consumo ni resultado exitoso. Un reintento exacto de respuesta ya aceptada puede recuperar **su** resultado aun si después caducó/sustituyó la revisión, sin volver a escribir ni divulgar otras respuestas.

**Agregado obligatorio desde la primera RPC de respuesta, no extensión vacía:** `sustituida` si el ciclo fue sustituido; en otra revisión, `rechazada` si existe un rechazo; si no, `pendiente` con cero confirmaciones, `parcial` con algunas, `completa` si todos los participantes fijos confirmaron. Incluye siempre al autor. El contador se deriva de respuestas persistidas del mismo snapshot, no de links emitidos ni de props. Respuesta + consumo + agregado + estado de revisión/documento + evento de auditoría + resultado idempotente se escriben en la **misma transacción**. El claim además verifica las filas, no confía únicamente en un contador.

Esto corrige una costura del plan F7-02 §5.3: **no es aceptable** integrar una RPC con recálculo vacío y completarlo en JS o una tarea posterior. `MVP-071/074` incorporan el agregado mínimo; `MVP-075` reutiliza esa autoridad, agrega proyecciones y controles de abuso. No cambia el alcance de producto ni requiere esperar a su UI.

## 4. Catálogo de comandos y resultados

Todos los comandos tienen `schemaVersion`, `idempotencyKey` cuando escriben y referencias explícitas. Tipos JSON en `src/lib/contracts/` (`MVP-020/021`); adapters no exportan tipos del SDK. Los nombres siguientes son estables para coordinar consumidores; cambios requieren actualizar ambos consumidores, no RPC paralelas equivalentes.

| RPC / owner de implementación | Entrada semántica → resultado |
| --- | --- |
| `create_document`, `append_message`, `save_draft` / `MVP-040/041/051` | Datos autorizados, secuencia/revisión esperada → identidad, secuencia/revisión persistida. Auditoría crítica atómica; metadatos append-only. |
| `persist_report` / `MVP-053/061/062` | Fuentes autorizadas exactas + salida/prompt/modelo/reglas → `reportId`; no UPDATE histórico. Solo ejecutor para resultados de proveedor. |
| `freeze_revision` / `MVP-070` | `documentId, expectedDraftRevision, selectedRoles` y proyección/bytes canónicos preparados por servidor → `revisionId, snapshotId, snapshotHash, confirmationStatus`. Canal ejecutor con actor verificado: valida propiedad, borrador CAS, procedencia de proyección, versión de esquema y hash/bytes; crea revisión/snapshot/participantes, sustituye enlaces pendientes y audita. |
| `confirm_author` / `MVP-071` | Sesión, `documentId, revisionId, snapshotId, expectedSnapshotHash, checkbox:true` → respuesta persistida + agregado. Autor se obtiene de sesión; no token público. |
| `issue_invitation`, `revoke_invitation` / `MVP-072` | Autor, revisión/snapshot, rol/generación esperada, hash nuevo/vencimiento definidos por política → metadatos seguros. Nunca plaintext persistido; reemisión revoca generación anterior sin borrar historia ni permitir una segunda respuesta al participante. |
| `read_invitation` / `MVP-073` | `tokenHash` → `PublicInvitationDTO` por allowlist, operación completa idéntica a la del autor; no chat/fuentes privadas. No disponible/inexistente sin enumeración externa. |
| `respond_to_invitation` / `MVP-074` | `tokenHash, revisionId, snapshotId, expectedSnapshotHash, decision, checkbox, declaredName, ratifiedRejection` → `{responseId, decision, respondedAt, confirmationStatus}` de esa capacidad. Revalida todo bajo locks. |
| `claim_finalization`, `abandon_finalization` / `MVP-080` | Autor/referencias esperadas → operación existente o reserva y claim; abandono explícito invalida fencing antes de admitir sustitución. |
| `stage_pdf`, `advance_finalization` / `MVP-081` | Interno: operación, fencing, fase esperada, bytes/hash/longitud o checkpoint → fase persistida. No RPC genérica de cambiar estado; transiciones enumeradas y precondiciones específicas. |
| `prepare_manifest`, `publish_version` / `MVP-082/083` | Interno: operación/fencing, bytes privados/envelope; luego reserva y evidencia de comparación del objeto con staging → versión final inmutable, auditoría y sello `no_iniciado` en el mismo commit. No acepta un booleano de cliente «uploaded». |
| `prepare_hcs_attempt`, `record_hcs_observation` / `MVP-091/092` | Interno: versión publicada, fencing, intención exacta o observación validada → intento/estado/localizadores; un solo activo. No RPC de «marcar registrado» accesible al autor. |
| `read_public_proof` / `MVP-100` | `reference` opaca → envelope, hash raíz, estado y localizadores públicos permitidos, sin detalle privado. No modifica ni reintenta sello. |

`declaredName` **obligatorio para confirmar y para rechazar como tercero** (INV-13). Confirmar exige casilla marcada y sin ratificación de rechazo; rechazar exige casilla desmarcada y ratificación verdadera. Validar nombre no vacío y límites del contrato, no inferir identidad real. El servidor no puede demostrar la apertura física de un modal; la UI prueba la interacción, SQL la coherencia de los campos. F7-02 no puede interpretar su `declaredName?` orientativo como opcional al rechazar.

Emisión entrega plaintext solo en la primera respuesta del servicio, fuera del resultado SQL persistido. Si se pierde, el reintento devuelve metadatos/`LINK_NOT_RECOVERABLE`, no inventa un enlace; reemitir es otra acción explícita con revocación según `MVP-011`. No copiar plaintext al registro de idempotencia para facilitar UX.

Envelopes técnicos: éxito `{schemaVersion, outcome:"completed", result}` o `{schemaVersion, outcome:"in_progress", operation:{operationId,phase,retryable}}`; error `{schemaVersion, code, stage, retryable, correlationId}`. Códigos mínimos: `NOT_AVAILABLE`, `FORBIDDEN`, `STALE_DRAFT`, `SNAPSHOT_MISMATCH`, `IDEMPOTENCY_CONFLICT`, `REVISION_NOT_ACTIVE`, `CONFIRMATIONS_INCOMPLETE`, `REVISION_REJECTED`, `FINALIZATION_RESERVED`, `STALE_CLAIM`, `ARTIFACT_CONFLICT`, `TECHNICAL_FAILURE`. No incluir token, rutas, consultas SQL o nombres de terceros en errores. Conflicto/rechazo no se confunde con advertencia documental.

## 5. Finalización durable y fencing

La reserva impide sustituir esa revisión **aunque venza el lease**: vencimiento habilita recuperar la misma operación, no cambiar sus entradas. Solo abandono explícito antes de publicar permite otra revisión. Un borrador puede continuar editándose. Tras abandono, se conserva la operación y PDF canónico si ya existe; reanudar esa revisión reutiliza la misma reserva/bytes y nuevo fencing. Si se necesita contenido distinto, otra revisión. Nunca dos operaciones canónicas para la misma revisión.

Fases técnicas monotónicas: `reserved → pdf_staged → manifest_ready → object_checked → published`; error/requiere-reintento no borra fase. `abandoned` invalida claim; recuperación explícita vuelve a la última fase durable con fencing nuevo. Lease y reloj son SQL; cada renovación/adopción/checkpoint/publicación compara número creciente, vencimiento, recurso y fase. No se devuelve el fencing al navegador como autorización.

| Punto de caída | Recuperación / exclusión |
| --- | --- |
| Antes del claim o con confirmaciones faltantes | No render/anexo/PDF ni HCS. El claim compara todas las respuestas del snapshot y reserva entradas/antecedente/renderer/referencia/nonce. |
| Render en memoria, sin staging | Puede repetirse el cálculo; no se promete exactly-once del render. Antes de aceptar bytes, comprobar fencing vigente. |
| PDF aceptado en `artifact_staging` | INSERT único; hash y longitud derivados de `bytea`, no confiados al request. Nunca re-render después de este checkpoint, ni para HCS. |
| Manifiesto aún no durable | Calcular desde PDF staged y detalle persistido con el mismo nonce; persistir bytes/hash/envelope antes de upload/publicación. |
| Upload falló o no existe el objeto | Copiar los mismos bytes al nombre reservado actual, sin overwrite. Operación no finalizada. |
| Upload exitoso, commit fallido o timeout | Inspeccionar objeto reservado: comparar bytes SHA-256 y longitud contra staging, adoptarlo bajo claim actual. No fiarse solo de metadata hash del objeto. |
| Expiró el claim durante upload | Otro fencing/reserva de objeto; puede copiar los mismos bytes canónicos. El objeto viejo no es adoptable por un trabajador tardío. |
| Objeto existente con bytes distintos | `ARTIFACT_CONFLICT`; conservar diagnóstico privado mínimo, no overwrite ni finalización. |
| Publicación confirmada, respuesta HTTP perdida | Devuelve la misma versión; no genera PDF ni otra versión. HCS posterior no modifica la versión. |

La publicación comprueba de nuevo reserva, entradas, hash de staging/manifiesto, objeto comparado, antecedente y claim; inserta versión/artefactos, actualiza punteros/agregado y audita atómicamente. Storage y Postgres no son una transacción distribuida: la comparación del objeto fuera del lock es válida porque ningún rol de aplicación puede cambiar/borrar ese objeto después. Si una cuenta administradora lo altera fuera del modelo de permisos, es incidente, no garantía que SQL pueda ofrecer.

Cada petición ejecuta trabajo acotado, persiste checkpoint y devuelve estado antes de su deadline. `GET` solo observa; `POST` autenticado reanuda por el propietario. Sin Redis/cola/cron ni trabajo garantizado tras responder. Si nadie vuelve, puede quedar pendiente indefinidamente. Cancelar HTTP no equivale a abandono SQL.

**Cotas no aprobadas:** propuesta para `MVP-010/012`: PDF/staging máximo 3 MiB, un PDF canónico por operación, JSON canónico máximo 1 MiB; comprobar además expansión de transporte `bytea`, memoria, límites de cuerpo y duración del despliegue. Propuesta de lease: 60 s y renovación antes de una fase costosa; solo viable si la operación mínima cabe en el deadline contratado (`MVP-013/132`). No son defaults aprobados ni autorizan truncar contenido acordado para caber. Una cota excesiva para los límites reales exige registrar la incompatibilidad antes de implementar su consumidor.

## 6. Retención e inmutabilidad: alcance real

INV-05/08/18 protegen frente a roles de aplicación, no frente al superusuario/proveedor o a una obligación legal. Sin UPDATE/DELETE de versiones, reportes asociados, originales aceptados, respuestas ni auditoría por roles de aplicación. Cambios técnicos de fase/intentos se mantienen separados de los bytes históricos; auditoría crítica se inserta en la misma transacción de cada cambio crítico, no en un `finally` de JS.

Limpieza de huérfanos es una operación administrativa explícita y acotada, **no cron nuevo**: marcar reserva abandonada bajo lock, invalidar fencing, comprobar que ningún artefacto/versión/operación recuperable la referencia, borrar únicamente objeto no adoptado y registrar resultado. Propuesta no aprobada: cuarentena de 7 días. Un nombre viejo no basta para decidir borrado. No purgar PDF canónico staged de operación recuperable. Tras publicar, retirar copia staging solo después de comprobación durable del objeto y decisión de retención; nunca eliminar el único ejemplar recuperable por vencer un lease.

Retención de hashes de token/resultados idempotentes, staging publicado, nonce y manifiesto privado depende de `MVP-011/012/014`. Mientras no haya política aprobada, no hacer purga automática. Limpieza legal autorizada usa procedimiento separado, permisos extraordinarios y registro mínimo; no interfaz admin universal de «editar historia». Eliminar PII puede hacer imposible abrir un compromiso histórico: no rotar nonce ni reescribir bytes para aparentar continuidad criptográfica. Referir esa limitación en vez de prometer inmutabilidad universal o retención perpetua.

## 7. Costuras de tests y evidencia

### Base real y dobles separados

`MVP-024` posee `tests/server/rls/`: arranque/reset local, usuarios A/B, cliente `anon`, assertions de tablas/Storage/grants y helpers de conexiones independientes. `MVP-120` **reutiliza** esos helpers y añade builders y dobles, no crea otra pila RLS. `src/mocks/` conserva solo escenarios/fixtures de contratos; dobles que importan interfaces de servicios viven en `tests/server/`. Esta precisión evita relajar la barrera actual pese al inventario amplio de SH-07/arquitectura.

Servicios con consumidor real reciben dependencias explícitas por constructor/factory local al dominio (repositorio RPC, reloj, renderer, Gemini/Groq, Storage, HCS/Mirror). La composición productiva en servidor siempre pasa adapters reales; no consulta una bandera mock, ni hace fallback. Evitar contenedor DI genérico. Vitest usa un alias de `server-only` a centinela vacío **solo en su configuración de test**; el runner Node de Playwright necesita el puente de bundle de test descrito abajo, no hereda ese alias. Barreras y build Next conservan el import real y sus casos negativos. No alias de proveedores dentro del build productivo.

### Navegador con dobles: decisión acotada y límite declarado

No usar hooks de Node/monkeypatch del bundle Next, overlays de fuentes ni un segundo árbol de aplicación. La composición estática de Next no garantiza que un `--import` sustituya módulos empaquetados. Tampoco añadir endpoints mock, una variable productiva `USE_FAKE_*` o URLs arbitrarias de proveedores para habilitar los tests.

La costura mínima de `MVP-121` es **dos evidencias complementarias**, no una afirmación falsa de E2E productivo completo:

1. **Integración servidor con dobles de las cuatro selecciones:** factories de handlers Web `Request → Response` en el dominio, con validación/autorización/proyección reales y servicios/RPC reales sobre Supabase local. Adapters externos Gemini/Groq/Storage/HCS/Mirror se inyectan desde `tests/server/`; pruebas de Storage/RLS además usan Storage local real. Los Route Handlers de Next solo componen contexto de sesión y llaman esas mismas factories. No duplicar lógica de rutas en tests.
2. **Playwright sobre rutas/páginas reales Next:** lecturas SSR/autorización con base local; para las mutaciones que necesitan proveedor, intercepción de transporte del navegador ejecutada por el runner invoca esas mismas factories/servicios con dobles y devuelve su respuesta, **no una transición fabricada por el test**. Cada transición se verifica en la base local y la siguiente lectura SSR real la observa. La intercepción no puede sustituir un fetch de servidor/RSC; las lecturas SSR han de ser libres de efectos de proveedor. No usar fixtures de red estáticos para fingir persistencia.

Factories son internas `server-only`, usadas por producto y tests; no exportar desde `src/app/**/route.ts` símbolos ajenos a la API de Next. Los tests consumen `Request/Response` directamente, sin servidor alternativo ni framework nuevo. La intercepción permite probar UI, flujos y lógica persistida con dobles, **no** el cableado HTTP de todas las mutaciones de Next. Añadir tests de las entradas delgadas y smoke de rutas que no requieren proveedores; no convertir esa suma en evidencia de un único recorrido Next sin intercepción.

### Puente Node para Playwright: bundle exclusivo de test

**Decisión:** `MVP-120` posee un entrypoint y un build programático Vite de pruebas bajo `tests/server/`; `MVP-121` consume su módulo ESM desde el runner Node, nunca desde el navegador. Importar directamente una factory marcada `server-only` en Playwright no es la solución: fuera de Next/Vitest el marcador puede lanzar y los imports de TypeScript/alias no tienen su resolución normal.

- El prestep/runner llama a `build` con `configFile:false`, configuración inline propia, entrada de test explícita, salida ESM orientada a Node/SSR y target compatible con Node del repositorio. Alias absolutos de `@/` hacia `src/` y coincidencia exacta de `server-only` hacia un centinela vacío **solo en este bundle**. Resolver el centinela durante el bundle, sin externalizar el marcador; el check del artefacto falla si queda un import runtime de `server-only` sin resolver. No cargar la configuración de preview Vite (que rechaza build), plugins de aplicación, configuración Next, archivos `.env` ni sustituciones globales de `process.env`.
- La entrada importa factories/servicios reales y adapters reales de Auth/RPC local **sin composición productiva ni inicialización de entorno**. Los puertos de Gemini/Groq/Storage/HCS/Mirror reciben dobles de `tests/server/`; imports de interfaces son `type-only`. SDK externos necesarios para Auth/Supabase local permanecen dependencias runtime resolubles; no compilar ni importar adapters productivos de proveedores externos para luego intentar sustituirlos. El módulo exporta la composición de prueba y acepta dependencias locales explícitas, no un registry DI genérico.
- Salida propuesta: `node_modules/.cache/galcoa-tests/<runId>/handlers.mjs`, generada e ignorada, con dependencias externas resolubles desde el repositorio. Un directorio aislado por ejecución evita compartir estado entre workers. Si se elige un temporal fuera del árbol, el build debe resolver sus dependencias externas desde la raíz explícitamente: no asumir que Node encontrará `node_modules` desde cualquier carpeta. El runner importa la URL del archivo generado tras terminar el build, cierra clientes/sesiones de test y elimina solo su directorio en teardown, también ante fallo. No reutilizar un bundle de otra ejecución; el prestep falla explícitamente si no puede generarlo.
- Guards a cargo de `MVP-120`: inspección de grafo/artefacto que rechaza `src/app/`, `next/headers`, composición productiva y adapters/SDK de IA/HCS reales; lista permitida explícita de dependencias runtime locales. Tests de barreras impiden cualquier import de `tests/`, del entrypoint, centinela o salida generada desde producto. Build Next normal **sin alias** y checks negativos conservan la protección `server-only`; ningún flag productivo selecciona este módulo. No distribuir el artefacto de test ni incluirlo como entrada de despliegue.

Esto es una compilación de módulos para el runner Node, no un clon/overlay de la aplicación, otra app o un servidor HTTP de pruebas. Vite ya es dependencia del proyecto. Su API programática y build SSR/Node permiten el puente conceptualmente; `MVP-120` debe comprobar la configuración exacta contra la versión instalada y ejecutar un smoke del import ESM antes de declarar el harness funcional. Este documento no acredita ese smoke ni un bundle ya generado.

**Auth real, no UID inventado:** el helper compartido de contexto recibe cookies/credenciales de request como datos y valida la sesión contra Auth **local**; no importa `next/headers` ni acepta un `userId` del test como autoridad. El adapter Next solo extrae cookies y adapta la respuesta de cookies del mismo helper; la entrada de pruebas adapta las cookies efectivas del contexto del navegador/request interceptado a esa misma función y propaga sus actualizaciones si las hay. Configuración local se inyecta desde el harness efímero, nunca desde secretos cloud. Factories/servicios reciben el contexto validado; los RPC siguen comprobando permisos. Probar cookies ausentes/caducadas, usuario B sobre documento de A y equivalencia de adaptación de cookies de ambas entradas. El tercero sigue pasando por validación de capacidad real sin sesión; solo proveedores externos son dobles, no autorización ni RLS.

La matriz `MVP-121` debe rotularlo «navegador Next + integración de handlers con dobles», identificar requests interceptados, import del bundle de test y comprobaciones en base local. Es evidencia **compuesta** de cuatro selecciones, no un single E2E Next íntegro con proveedores fake. Queda explícito el hueco de transporte/composición de mutaciones HTTP Next→proveedores; el recorrido íntegro con adapters reales corresponde a `MVP-134`, solo autorizado. El líder ajusta la aceptación del maestro/plan consumidor para reflejar esta composición; este diseño no modifica esos documentos ni declara cumplido su texto vigente por equivalencia implícita. Tampoco exige resolver un E2E Next íntegro con todos los dobles como prerrequisito oculto antes de `MVP-134`.

### Casos que no admiten simulación como evidencia

- A/B/anon contra Postgres y Storage locales reales: listado, lectura, INSERT, UPDATE, DELETE, funciones internas, lectura pública mínima y RLS de todas las tablas expuestas.
- Conexiones independientes: confirmar vs. rechazar, respuesta vs. supersede/revocar/vencer, autor vs. tercero último, freeze vs. claim, dos claims, vencimiento/abandono vs. publicación. Assert de filas/agregado/auditoría/idempotencia, no solo status HTTP.
- Fallo forzado antes del commit de respuesta: no consumo aislado ni agregado parcial. Worker con fencing viejo falla en **cada** checkpoint/publicación; objeto tardío no reemplaza ganador.
- Upload ok/commit fallido y PDF staged se recuperan byte a byte. Nueva versión mantiene v1 intacta. Una llamada directa del propietario no puede adoptar bytes/manifiesto arbitrarios ni marcar HCS registrado.

## 8. Ownership de migraciones y pendientes

`MVP-022/023/024` ([F2](../exec-plans/active/mvp/f02-esquema-migraciones-rls.md)) posee tablas, constraints y seguridad base C1–C3; no implementa todos los comandos futuros. Cada consumidor incorpora **migración aditiva** de sus RPC/políticas: F4 auditoría/núcleo, F7 revisión/respuestas, F8 claim/artefactos/publicación, F9 intención/observaciones, F10 lectura pública. Una RPC tiene un owner de escritura, no dos implementaciones concurrentes. Guardas de reserva de finalización se añaden a `freeze_revision` en F8 con migración posterior. El líder coordina un orden total de nombres y aplicación; no ejecutar todos los planes SQL en paralelo por tener distintas features. No editar migraciones ya aplicadas.

Pendientes reales: parámetros de ingesta/staging/deadlines (`MVP-010/013`), política de capacidad/abuso/reemisión/retención (`MVP-011`), aprobación del perfil y parámetros de prueba/reconciliación (`MVP-012`), retención legal (`MVP-014`), conectividad/provisión del ejecutor SQL mínimo y compatibilidad con despliegue (`MVP-025/026/132`), y hueco E2E Next íntegro señalado arriba (`MVP-121/134`). No marcar esas tareas completas por existir este documento. Referencias de specs de otros redactores: `docs/specs/review-confirmation.md`, `public-capabilities.md`, `release-validation.md`; sus parámetros siguen siendo propuestas hasta aprobación correspondiente.

## Referencias técnicas consultadas

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), documentación oficial consultada mediante Context7 el 2026-10-16: funciones privilegiadas, `search_path` vacío, cualificación y revocación de ejecución. No son prueba de que los grants de esta aplicación existan.
- [Vite JavaScript API](https://vite.dev/guide/api-javascript), [build SSR](https://vite.dev/config/build-options#build-ssr) y [opciones SSR](https://vite.dev/config/ssr-options), consultados mediante Context7 (referencia v8.0.10): build programático con configuración inline, `configFile:false`, salida SSR y control de externalización. Validar opciones/tipos contra Vite instalado al implementar; el puente no usa el build de preview ni cambia Next.
- Evidencia de base: [`document.ts`](../../src/lib/contracts/document.ts), [`package.json`](../../package.json) y [barreras](../../tests/boundaries/manifest.mjs). No hay esquema/servicios implementados. APIs de drivers, Storage y Auth se verifican contra versiones instaladas al implementar; este diseño fija permisos y contratos, no recetas de SDK.

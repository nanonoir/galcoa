# F4 — Evidencias: carga privada, hash y extracción de texto

Tareas del maestro: `MVP-042`, `MVP-043`

**Estado: backend integrado en develop (PR #86, PR #96 y PR #97, base 9d5cd15); validado en CI local DB con revisión independiente PASS; aceptación MVP-042/043 PARCIAL (UI chat no montada, sin IA real en sesión viva ni cloud).** Se conservan los servicios de PR #48; evidencia y contrato HTTP en §8. Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3, §4 REQ-04, §6 INV-04/07/09, §11, §12), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-01`, `SH-03`, `SH-05`, `SH-07`, `SH-08`, `SH-10`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md). No repite esos documentos.

## 1. Objetivo y estado de partida

**Estado actual tras checkpoints de integración (PR #86, PR #96 y PR #97):**
El backend de persistencia, Storage privado autenticado, retención de cuotas y protocolo terminal de descarte quedó integrado en `develop` (base `9d5cd15`).
- PR #86 (`f1013d8`): Persistencia transaccional de evidencias y extracciones, EvidenceStore RPC interno con actor ligado, Storage privado autenticado con TTL SQL de 120 s (`upload_expires_at`) y Route Handlers privados bajo `/api/documents/[id]/evidences`. Revisión independiente posterior con resultado PASS.
- PR #96 (`aaea26c`): Retención de cuotas por documento en reservas vencidas (migración `20261016002200_evidence_retained_quota.sql`), impidiendo que el vencimiento libere cupo automáticamente sin descarte. Verificado en CI Linux run `38989208876` SUCCESS (`validate` 3m40s, `local-server-db` 5m39s, 1099 unit, 69 bounds).
- PR #97 (`9d5cd15`): Protocolo terminal de descarte irreversible en 3 pasos (claim terminal SQL bajo advisory lock de actor y lock de documento → `Storage.remove` → `discard_evidence_reservation`, migración `20261016002300_evidence_discard_protocol.sql`). Limpieza oportunista por propietario en lotes de hasta 3 reservas candidatas al reservar; RPC revalida que no queden descartes pendientes (`discard_pending`); autorización RLS serializada con reloj posterior al lock; originales aceptados inmutables (trigger `evidence_discard_guard`); reintento ante fallo de Storage retiene cuota y claim. Revisión independiente (sesión `ses_eb88f0798ffedC3FY0N89Bgi63`) PASS; autor validó 1103 unit, lint, types, build, 69 bounds; CI run `38990325702` SUCCESS (`validate` 2m23s, `local-server-db` 5m50s con 5 nuevos escenarios reales).
- Aceptación de `MVP-042` y `MVP-043` permanece PARCIAL: la UI de chat no está montada (`MVP-054` / `MVP-116`), no se ejecutaron llamadas reales con proveedores de IA en sesión en vivo (`MVP-050`/`MVP-134`), y las migraciones remotas no se han aplicado en cloud (sin verificar). Issue #11 permanece abierta. El plan se conserva activo; NO se cierra ni se archiva en este checkpoint.

`MVP-042`: aceptar texto, PDF e imágenes simples dentro de los límites decididos, conservar el original en Storage privado con SHA-256 de sus bytes y metadatos, y rechazar con motivo técnico explícito. `MVP-043`: persistir texto extraído con procedencia; un fallo del proveedor es un impedimento informado, nunca texto inventado, y no se proclama verificación visual independiente.

## 2. Criterios del PRD

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-042` | REQ-04, REQ-17, INV-09, INV-06 | Originales privados, hash, metadatos; rechazo técnico explícito; sin URL pública permanente (PRD §11) |
| `MVP-043` | REQ-04, REQ-06 (insumo), INV-07 | Texto con procedencia; fallo = impedimento informado; sin independencia visual proclamada (PRD §4 «Límites de actuación») |

## 3. Dependencias

| Para | Requiere `completada` en el maestro |
| --- | --- |
| `MVP-042` | `MVP-041` (mensajes), `MVP-010` (decisión de límites y pipeline **documentada**), `MVP-024` (RLS y buckets) |
| `MVP-043` | `MVP-042` y `MVP-050` (cliente Gemini servidor) |

- `MVP-042` **no** depende de `MVP-050`: el endpoint de extracción es independiente de la carga (§5), para que 042 pueda cerrarse antes que el proveedor.
- Salidas: `MVP-054` consume `MVP-042`; `MVP-053` y `MVP-061` consumen `MVP-043`; `MVP-051` puede aceptar extracciones opcionales (ver su plan).
- Una tarea que depende de `MVP-010` no empieza su consumidor sin la decisión documentada (maestro §8.7). Las partes independientes (hash sobre bytes, adaptador de Storage con nombre reservado, esquema de rechazo) pueden avanzar antes.

## 4. Decisiones y pendientes

- **Pendiente `MVP-010`** ([SH-10](../../../design/mvp-shared-foundations.md)): tipos MIME, tamaños, páginas, tratamiento de texto/PDF/imagen y de discrepancias visuales. Este plan no fija valores; los límites se leen de una configuración tipada cuya fuente es el registro aprobado de `MVP-010` (ver `RQ-B1`, [sources-and-ai §7](../../../specs/sources-and-ai.md)). Cualquier default de desarrollo se etiqueta «propuesto, no aprobado».
- **Texto como evidencia:** si «texto» es un archivo `.txt` o contenido pegado almacenado como evidencia lo define `MVP-010`; el plan implementa la parte común (bytes + hash) y deja la variante pendiente.
- **Metadatos estructurados de PDF** (productor, fechas de creación/modificación) necesarios para `MVP-061`: si se extraen deterministamente aquí o en otra etapa lo decide `MVP-010`. Solicitud en §10.
- **Disparador de la extracción:** endpoint separado invocado por el container tras una carga exitosa (decisión técnica local, desacopla 042 de 050); alternativas se evalúan al implementar sin cambiar contratos.
- **Contratos `MVP-020/021`:** esquemas de evidencia y extracción son base compartida; no se redefinen aquí.

## 5. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `src/lib/documents/evidence*` (o equivalente en `src/lib/documents/`) | Servicio de evidencias, `server-only` | Lógica de revisión/finalización |
| `src/lib/supabase/` | Adaptador de Storage privado (bucket de `MVP-024`) y persistencia | URLs públicas, claves en cliente |
| `src/lib/ai/` | Servicio de extracción que usa el cliente de `MVP-050` | Herramientas de acción, envío a blockchain (INV-04) |
| `src/app/api/` | Handlers de carga y de extracción (propuestos: `POST /api/documents/[id]/evidences`, `POST /api/documents/[id]/evidences/[evidenceId]/extraction`) | Endpoints de otros dominios |
| `tests/server/` | Casos con dobles de Storage y de Gemini | Dobles en código de producto; `src/mocks/` solo depende de contratos |
| `src/features/*/components/` | Nada (la UI de adjuntos va en `MVP-054`) | Todo |

## 6. Pasos

### Checkpoint de conexión #11 — investigación previa (2026-10-16)

**Decisión posterior del líder (autorizada en esta sesión):** carga estándar
autenticada con JWT de sesión existente y RLS de reserva con columna aditiva
`upload_expires_at`; no emitir tokens `upload/sign`, que eluden RLS al consumirlos.
`authorizeDirectUpload` devuelve `transport: authenticated`, bucket fijo,
objectPath opaco, MIME, maxBytes y expiresAt de la DB. La autoridad expira en
Storage/RLS, no en un reloj de UI. No hay credencial nueva ni proxy de bytes.
La migración 001200 aún no se aplicó al tomar esta decisión y agrega la columna
y el reemplazo del helper C4; C4 no se edita. El helper browser autorizado vive
solo en `features/auth/containers/supabase-browser.ts`; su esquema puro en
`features/auth/contracts/evidence-upload.ts` evita llevar módulos server-only
al navegador. La prueba debe distinguir upload iniciado después del vencimiento
de uno en vuelo: no se promete cancelación de transferencia a los 120 s.

**Reanudación autorizada:** se implementa primero persistencia independiente de
Storage. Canal interno exclusivo para las siete RPC: `reserve_evidence`,
`get_evidence`, `list_evidences`, `accept_evidence`, `discard_evidence_reservation`,
`append_evidence_extraction`, `list_evidence_extractions`. Todas reciben primero
`p_actor_id` ligado por el adapter a Auth verificado; no son RPC públicas de autor.
Reserva: documento, tipo/MIME/longitud/hash/ruta/fecha, clave y fingerprint;
lecturas: documento y, para get, evidencia; aceptar/descartar: evidencia
(aceptar además correlación); extraer: documento/evidencia, método/modelo/prompt,
páginas/texto/limitaciones/correlación. Límites SQL fijos 10 MiB/3/20 MiB y
vigencia derivada de `uploaded_at + 120 s`; replay vencido no renueva autoridad.
Aceptación y extracción auditan atómicamente. Un rol owner NOLOGIN mínimo
posee estas funciones, sin acceso del ejecutor a tablas. Se ajusta únicamente
la condición de vigencia del helper de INSERT Storage existente, sin publicar
todavía adapter de carga ni endpoint HTTP. La investigación de transporte sigue
separada; no bloquea este checkpoint SQL. Se probarán conexiones independientes,
caducidad, rollback y lecturas mediante el mismo EvidenceStore de producción.

Base exclusiva: `flow/evidence-wiring`, `a132ccb`, encadenada a
`flow/executor-transport` (PR #80); sin merge automático ni cierre de #11.
Se preservan los servicios puros de PR #48. Secuencia prevista: (1) comprobar
el contrato real de Storage y la frontera de autorización; (2) enumerar las
RPC de evidencia/extracción y sus argumentos ligados al actor en el ejecutor;
(3) migración aditiva `20261016001200_evidence_persistence.sql`, adapters y
catálogo mínimo de auditoría; (4) composición Auth real y handlers con DTO
sin rutas internas; (5) pruebas locales A/B/anon, conexiones independientes,
Storage real y modelo doble, más checks de integración. El contrato HTTP
exacto se registrará al resolver el transporte de carga, antes de publicarlo
a consumidores; no hay endpoints nuevos disponibles todavía.

**Bloqueo encontrado antes de código:** `EvidenceStorage.createSignedUpload`
recibe `expiresInSeconds: 120` desde el servicio existente. La API oficial
`createSignedUploadUrl(path, { upsert })` no admite duración; sus permisos de
carga duran dos horas. No es correcto devolver `expiresAt = ahora + 120 s`
para un token que sigue autorizando cargas después. Tampoco se ha comprobado
que una reserva vencida revoque un token de carga ya firmado. Fuentes:
[API Storage JS](https://github.com/supabase/supabase-js/blob/master/packages/core/storage-js/src/packages/StorageFileApi.ts)
y [referencia oficial de permisos de carga](https://supabase.com/docs/reference/python/storage-from-createsigneduploadurl),
consultadas con Context7 el 2026-10-16. La lectura firmada sí acepta duración.

Decisión necesaria del líder: autorizar un transporte que pueda imponer los
120 s reales (y sus requisitos de configuración), o revisar expresamente ese
contrato. No se cambia a dos horas, no se inventa caducidad en el DTO y no se
introduce proxy de archivos grandes ni credenciales nuevas por iniciativa
del agente. La persistencia/RPC es una parte independiente aún no implementada;
este hallazgo no la declara bloqueada ni completada.

Comprobaciones realizadas: árbol limpio y HEAD/base verificados; Issue #11 y
comentarios leídos; puertos/servicio y diseño transaccional inspeccionados.
`docker.exe ps` mostró únicamente `entrenar-backend-1` y
`entrenar-postgres-1`: no se tocaron. No se arrancó pila, no se aplicó migración,
no se leyeron secretos y no se ejecutaron tests ni llamadas a proveedores.

### 6.1 MVP-042 — Carga privada

- [x] Verificar `MVP-010` documentado; límites aplicados en servidor (10 MiB por archivo, 3 archivos y 20 MiB acumulados por documento, PDF ≤ 10 págs, imágenes ≤ 20 MP; PRD §4 REQ-04, sources-and-ai §7).
- [x] Validación de entrada: sesión y propiedad del documento, tipo declarado vs. firma real de los bytes (`SH-03`), tamaño y páginas según `MVP-010`.
- [x] Reservar `evidenceId` y ruta de objeto opaca; calcular SHA-256 sobre los bytes originales exactos; subir sin sobrescritura mediante subida directa autenticada con JWT de sesión existente y TTL SQL de 120 s (migración `20261016001200_evidence_persistence.sql`).
- [x] Retención de cuotas por documento en reservas vencidas (migración `20261016002200_evidence_retained_quota.sql`, PR #96).
- [x] Protocolo de descarte irreversible en 3 pasos (claim SQL irreversible → `Storage.remove` → `discard_evidence_reservation`, migración `20261016002300_evidence_discard_protocol.sql`, PR #97). Limpieza oportunista por propietario en lotes de 3 al reservar; RLS serializada con reloj posterior a la espera del lock; objetos aceptados nunca se borran ni reciben claim; fallos de Storage retienen cuota y claim.
- [x] Errores técnicos con código estable (rechazo por tipo, tamaño, páginas, corrupción, almacenamiento); imagen ilegible o ambigua conservada como limitación informativa (`SH-03`).
- [x] Acceso al original: sin URL pública permanente; lectura firmada breve (60 s) solo para el propietario (`SH-07`).
- [x] Emitir evento de auditoría atómicamente mediante puerto `MVP-044` (`evidence.accepted`).
- [ ] Montaje de presentación y contenedor de adjuntos en la interfaz de usuario de chat (`MVP-054` / `MVP-116`).
- [ ] Verificación de despliegue y migraciones en entorno cloud remoto (`MVP-134`).

### 6.2 MVP-043 — Extracción con procedencia

- [x] Texto directo: decodificación determinista sin IA, registrada con método `directo`.
- [x] PDF/imagen: servicio de extracción con puerto real consumiendo dobles en tests (`MockLanguageModelV4`), con delimitación de datos no confiables y salida estructurada validada con Zod (`SH-08`). Ilegible o ambiguo marcado como limitación; jamás se completa un valor.
- [x] Persistir extracción separada del original con procedencia, método, versión de prompt, páginas, texto, limitaciones y tiempo del servidor; append-only con auditoría atómica (`SH-08`). Marca persistida: «interpretada por Gemini; sin verificación visual independiente» (INV-07).
- [x] Fallo de red/proveedor, configuración ausente o salida inválida: impedimento técnico informado, estado de operación técnica fallida reintentable; cero extracción ni texto inventado; original intacto.
- [x] Logs y auditoría con IDs de correlación; sin prompts, texto de documentos ni secretos.
- [x] Contrato y Route Handler de lectura de extracciones para `MVP-051/053/061` (`GET /api/documents/[id]/evidences/extractions`).
- [ ] Integración en vivo con modelo Gemini real en sesión interactiva completa (`MVP-050` / `MVP-134`).
- [ ] Consumo del endpoint de extracción desde el container de chat (`MVP-054`).

## 7. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| `MVP-042` | Subida válida: hash coincide con SHA-256 de los bytes; registro privado; ruta no derivada del nombre; sin URL pública |
| `MVP-042` | Tipo no admitido, tamaño excedido, firma que no corresponde al MIME, PDF corrupto: rechazo con código estable, sin objeto persistido |
| `MVP-042` | Documento ajeno o sin sesión: denegado; mismo contenido con la misma clave: un registro |
| `MVP-042` | Fallo de Storage simulado: no queda registro; fallo de persistencia: sin referencia a objeto huérfano |
| `MVP-042` | Fecha del hecho y fecha de carga separadas (INV-09) |
| `MVP-043` | Texto directo se persiste con método `directo`; PDF/imagen con doble de Gemini persisten procedencia y limitación visual |
| `MVP-043` | Fallo del proveedor/config ausente/salida inválida: error técnico, cero extracción persistida, original intacto, reintento crea otro registro |
| `MVP-043` | Contenido con instrucciones inyectadas («ignora lo anterior…») no altera esquema ni acciones; ninguna herramienta expuesta |
| `MVP-043` | Ninguna cadena de la UI ni del DTO afirma «verificado visualmente» |

Aislamiento de Storage entre dos usuarios: `MVP-024`/`MVP-121`, con base local real.

## 8. Validación, evidencia y rollback

### Evidencia de conexión local previa (PR #86) — 2026-10-16

*(Nota de actualización: el estado preliminar de `flow/evidence-wiring` que indicaba «pendiente revisión independiente e integración» quedó formalmente superado. PR #86 fue integrado en `develop` y contó con revisión independiente PASS. Las entregas posteriores PR #96 y PR #97 endurecieron la retención de cuotas y el protocolo de descarte, como se detalla más abajo).*

- `npm ci` sin cambios de paquete/lock; lint y typecheck exit 0; `npm test`
  **987/987**; build exit 0 con las cinco rutas de evidencia enumeradas.
- `test:boundaries` **69/69**, sin excepciones nuevas: el módulo browser aislado
  está permitido por las barreras existentes, no se abre una carpeta de servidor.
- `npx vitest run --config tests/server/evidence-persistence/vitest.local.config.ts`
  desde reset aplicó ocho migraciones (C1–C4/F4/login/evidencia/catálogo),
  suite ampliada **12/12**, repetida desde reset. SQL/Storage/Auth reales; Gemini usa
  el puerto real con `MockLanguageModelV4` exclusivamente en tests.
- Suite RLS de catálogo/inmutabilidad/Storage **119/119** sobre la base migrada.
  Se actualizaron solo el catálogo exacto de migraciones/RPC y el MIME de su
  fixture (ahora PDF, no `.txt`, porque el bucket impone los formatos aprobados).
- Regresión local adicional sin reset: persistencia F4 **8/8**, LOGIN ejecutor
  **6/6**, suite local Auth/bridge **8/8**. Los fixtures retiran la contraseña
  efímera de LOGIN en teardown; ninguna URL privada se escribe en archivos.
- Base integrada en PR #86: `f1013d8`. Revisión independiente posterior con resultado PASS.
- Cuatro conexiones LOGIN independientes respetan 3 archivos; también 20 MiB.
  Replay, fingerprint semántico diferente, otro dueño/documento, vencimiento,
  liberación de cupo, hash incorrecto y limpieza están cubiertos. Fallo de
  auditoría revierte aceptación/extracción; el objeto subido se conserva y se
  adopta al reintentar. Extracciones append-only, lector y correlación mínima.
- Storage real rechaza upload con JWT todavía válido cuando la reserva ya
  venció (error de RLS, no un reloj UI); permite reserva vigente y rechaza
  sobreescritura, otros dueños, anon, MIME no admitido y archivo >10 MiB.
  El permiso no limita criptográficamente el tamaño declarado por debajo de
  10 MiB: el servidor verifica longitud/hash/contenido antes de aceptar.
- `001200` incluye la columna de caducidad y el helper Storage; `001201` amplía
  el catálogo SQL después de la primera aplicación local, sin editar migraciones
  publicadas.

### Evidencia de endurecimiento e integración posterior (PR #96 y PR #97) — 2026-10-16

#### 1. Retención de cuotas de reservas vencidas (PR #96, commit `aaea26c`)
- **Problema abordado:** la liberación automática de cuota por vencimiento de reserva permitía a un cliente abusivo agotar almacenamiento físico generando sucesivas reservas abandonadas sin consumir cuota documental permanente.
- **Implementación:** migración `20261016002200_evidence_retained_quota.sql`. `reserve_evidence` evalúa las cuotas del documento (máximo 3 archivos y 20 MiB acumulados) contando todas las filas retenidas bajo el lock del documento (`FOR UPDATE`), independientemente de si la reserva ha vencido en tiempo, hasta tanto no se complete el descarte explícito.
- **Validación remota CI:** Run Linux GitHub Actions `38989208876` SUCCESS (`validate` 3m40s, `local-server-db` 5m39s), 1099 unit tests y 69 barreras arquitectónicas aprobadas.

#### 2. Protocolo terminal de descarte irreversible (PR #97, base `9d5cd15`)
- **Problema abordado:** evitar condiciones de carrera donde un objeto huérfano es eliminado de Storage mientras el usuario intenta aceptarlo, o donde la eliminación de Storage falla dejando la reserva liberada incorrectamente.
- **Implementación:** migración `20261016002300_evidence_discard_protocol.sql`:
  - Protocolo terminal de 3 pasos: `claim_evidence_discard` (SQL bajo advisory lock de actor `pg_advisory_xact_lock` y lock `FOR UPDATE` sobre documento) → eliminación física por Storage API (`Storage.remove`) → finalización del descarte (`discard_evidence_reservation`).
  - Columna `cleanup_claimed_at timestamptz` y trigger `private.evidence_discard_guard`: prohíbe DELETE sin claim previo; prohíbe claim o descarte sobre evidencias ya aceptadas (`Original inmutable`); hace irreversible el claim una vez asignado.
  - Inmutabilidad estricta de aceptadas: `accept_evidence` rechaza reservas con claim o expiradas; si la aceptación confirma la fila, jamás concede claim de borrado.
  - Limpieza oportunista por propietario: `createEvidenceService.requestUpload` invoca `list_evidence_discards` para recuperar hasta 3 reservas candidatas vencidas o con claim del mismo actor antes de insertar una nueva reserva.
  - Revalidación en RPC: `reserve_evidence` revalida que no existan reservas del actor pendientes de descarte (`discard_pending`), evitando confiar en limpiezas previas no atómicas.
  - Serialización RLS de subida: `private.can_upload_evidence_object` se serializa tomando `FOR UPDATE` sobre el documento y evalúa `upload_expires_at > clock_timestamp()` con reloj posterior a la espera del lock.
  - Resiliencia ante fallos de Storage: si `storage.remove` arroja error de red o indisponibilidad, la reserva permanece con claim asignado, retiene la cuota del documento y no libera cupo ni permite nuevos permisos hasta resolverse.
- **Validación del autor:** 1103 unit tests, lint, types, build y 69 barreras arquitectónicas. (Se registró honestamente que en la primera corrida de barreras hubo 68/69 por un timeout transitorio de ESLint bajo alta carga de CPU; la repetición inmediata con idéntica configuración y comando aprobó 69/69 sin alterar la configuración del proyecto).
- **Revisión independiente (PR #97):** sesión `ses_eb88f0798ffedC3FY0N89Bgi63` con dictamen PASS; reejecutó y verificó types, lint, 69 barreras, 37 tests de evidencia y 10 tests de extracción.
- **Validación remota CI (PR #97):** Run Linux GitHub Actions `38990325702` final SUCCESS (`validate` 2m23s, `local-server-db` 5m50s), ejecutando los 5 nuevos escenarios reales en Postgres y Storage locales:
  1. Complete tardío tras vencimiento: elimina bytes tras claim y reserva nueva recupera abandonos propios.
  2. Abandono de reserva sin complete: siguiente reserva del propietario limpia y recupera cupo.
  3. Carrera concurrente aceptación vs claim: un solo ganador; si gana aceptación, el original es inmutable y no se concede claim ni se borra el archivo.
  4. Autorización RLS de Storage: espera lock de documento y revalida expiración con reloj de DB posterior a la espera.
  5. Carga HTTP con cuerpo pendiente: body abierto mientras se confirma el claim aborta la carga y previene publicación o descarga del objeto.

#### 3. Límites de evidencia y deuda técnica residual
- El test de subida HTTP con cuerpo pendiente demuestra que el claim aborta la adopción y previene la descarga del objeto, pero no prueba por sí solo el momento exacto del preflight de Supabase Storage ni la eliminación física inmediata en los discos del backend.
- No existe un proceso en segundo plano (cron/SLA) que imponga un límite físico global de almacenamiento en el bucket ni garantice plazo de limpieza si el usuario no vuelve a realizar reservas (registrado en Technical Debt Tracker, item #8).
- No se emplean formulaciones absolutas en la documentación (e.g. evitar proclamar «garantía matemática de no interbloqueo» ni sobreproclamar auditorías).
- Aceptación de `MVP-042` y `MVP-043` permanece **PARCIAL**: la interfaz de usuario de chat no está montada (`MVP-054` / `MVP-116`), no se ejecutaron llamadas reales con proveedores de IA en vivo (`MVP-050`/`MVP-134`), y las migraciones remotas no se han aplicado en cloud (las variables de entorno informadas por el usuario no se leyeron ni se afirma password NULL; conectividad cloud sin verificar). Issue #11 permanece abierta.

### Contrato HTTP para MVP-054 / presentación

Todos usan sesión cookie existente validada con Auth.getUser y respuestas privadas
`no-store`; mutaciones requieren Origin canónico y JSON, máximo **16 KiB**.
No hay multipart ni bytes de archivo en Next. IDs vienen del path; actor, ruta,
hash comprobado y metadatos de extracción nunca se aceptan como autoridad del body.

| Método / ruta bajo `/api/documents/{id}/evidences` | Body / resultado |
| --- | --- |
| POST raíz | `{mimeType,byteLength,sha256,declaredEventDate,idempotencyKey}` → `{evidence,upload}` |
| GET raíz | Sin body → evidencias aceptadas, sin `privateLocation` |
| POST `/{evidenceId}/complete` | `{}` → evidencia aceptada solo después de revalidar bytes y commit SQL |
| GET `/{evidenceId}/original` | Sin body → `{url,expiresAt}`, lectura firmada 60 s solo propietario |
| POST `/{evidenceId}/extraction` | `{}` → extracción persistida (método/modelo/prompt/páginas/texto/limitaciones/tiempo) |
| GET `/extractions` | Sin body → filas históricas de extracción del propietario |

Éxito HTTP **200**: `{schemaVersion:1,outcome:"completed",result,replayed?}`.
Reserva devuelve `upload:{transport:"authenticated",bucket:"evidences-private",
objectPath,contentType,maxBytes,expiresAt}`; `expiresAt` viene de SQL. No hay
URL/token firmado de subida ni JWT en el DTO. Para cargar, el consumidor llama
`uploadReservedEvidence(upload,file)` (SDK estándar, sesión existente,
`upsert:false`), después `/complete`, después `/extraction` si corresponde.
Replay de original aceptado devuelve `upload:null`. Replay de reserva vencida
devuelve no disponible; nueva solicitud requiere una clave nueva y vuelve a
comprobar cuotas bajo lock (no hay renovación implícita).

Error: `{error:{code,stage,retryable,correlationId}}`, sin errores SQL crudos.
401 sin sesión; 403 origen hostil; 404 recurso ajeno/inexistente/vencido;
400 JSON/schema inválido (incluidos campos extra/actor del body); 409 conflicto
idempotente/cuotas/objeto todavía no subido; 413 JSON >16 KiB; 422 rechazo técnico
de contenido/límites de archivo; 503 fallo técnico reintentable. Proveedor sin
configuración devuelve su error técnico, nunca extracción inventada.

## 9. Cierre

**Estado del plan: ACTIVO (Checkpoint parcial registrado, NO cerrado ni archivado).**

Este checkpoint concilia las integraciones completadas en `develop` (PR #86, PR #96 y PR #97, base `9d5cd15`). Las filas `MVP-042` y `MVP-043` del maestro permanecen en estado `en_curso`, y este plan se mantiene activo en `docs/exec-plans/active/mvp/f04-evidence-upload-extraction.md`. No se archiva a `docs/exec-plans/completed/` ni se cierran las Issues #11 o #35 en este paso.

El cierre definitivo y archivo a `completed/` se realizará de forma coordinada únicamente cuando se cumplan los criterios pendientes:
1. Montaje e integración del contenedor y presentación de evidencias en la UI de chat (`MVP-054` / `MVP-116`).
2. Validación de extracción con modelo Gemini real en sesión integrada (`MVP-050` / `MVP-134`).
3. Aplicación y verificación de migraciones en la base de datos cloud remota.
4. Sesión final integrada y cierre formal coordinado de la Issue #11.

## 10. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§1, §6 y §7): alcance de fuentes, casos S-01/S-03 y registro abierto de `MVP-010` (formatos, tamaños, páginas, pipeline, metadatos PDF), aún propuesto, no aprobado; `RQ-B2` — [data-transactions](../../../design/data-transactions.md): objetos privados, tablas de evidencia/extracción y orden objeto↔fila.

**Solicitudes:** a `MVP-020` (contratos de evidencia/extracción con proveedor, método, página y limitaciones); a `MVP-024` (políticas de bucket compatibles con subida de servidor y lectura firmada); a `MVP-061` (¿qué metadatos PDF necesita?); a `MVP-054` (consumir el endpoint de extracción tras la carga).

**Decisiones pendientes:** valores de `MVP-010` (parte dependiente: límites y pipeline de PDF/imagen); no hay otras.

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Siguiente en F5: [Proveedor Gemini](f05-gemini-provider.md)

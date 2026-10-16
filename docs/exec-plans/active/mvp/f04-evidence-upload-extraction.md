# F4 — Evidencias: carga privada, hash y extracción de texto

Tareas del maestro: `MVP-042`, `MVP-043`

**Estado: conexión local implementada en `flow/evidence-wiring`, pendiente revisión independiente e integración.** Se conservan los servicios de PR #48; evidencia y contrato HTTP en §8. Sin cloud ni IA real. Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3, §4 REQ-04, §6 INV-04/07/09, §11, §12), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-01`, `SH-03`, `SH-05`, `SH-07`, `SH-08`, `SH-10`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md). No repite esos documentos.

## 1. Objetivo y estado de partida

**Estado del checkpoint de conexión (posterior a PR #48):** `flow/evidence-wiring`
integra `origin/develop` con PR #80 (`ca957b0`). RPC, Storage privado y handlers
probados localmente; pendiente revisión independiente e integración. Los párrafos
históricos de preparación no describen ya el inventario actual. Sin cloud ni IA real.

`MVP-042`: aceptar texto, PDF e imágenes simples dentro de los límites decididos, conservar el original en Storage privado con SHA-256 de sus bytes y metadatos, y rechazar con motivo técnico explícito. `MVP-043`: persistir texto extraído con procedencia; un fallo del proveedor es un impedimento informado, nunca texto inventado, y no se proclama verificación visual independiente.

**Estado real verificado:** no existen Storage, buckets ni integración de extracción/IA. `@ai-sdk/google` está instalado, sin consumidor; faltan `ai`, `@ai-sdk/react` y `groq-sdk`. Solo hay contratos de resumen y herramientas. Nada de lo descrito está implementado.

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

- [ ] Verificar `MVP-010` documentado; leer la fila y las guías locales de Route Handlers (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`) para el tratamiento de cuerpos multipart/binarios en la versión instalada.
- [ ] Validación de entrada: sesión y propiedad del documento, tipo declarado vs. firma real de los bytes, tamaño y páginas según `MVP-010`; límite aplicado antes de leer todo en memoria cuando la API lo permita.
- [ ] Reservar `evidenceId` y ruta de objeto opaca (no el nombre de archivo del usuario); calcular SHA-256 sobre los bytes originales exactos (`SH-03`), longitud y MIME verificado; subir sin sobrescritura; persistir registro con propietario, hash, longitud, ruta privada, nombre original saneado como metadato privado, `createdAt` del servidor y fecha declarada del hecho opcional separada.
- [ ] Orden y recuperación: si falla la persistencia tras subir, limpieza acotada solo de objetos no referenciados; si falla la subida, no se persiste el registro. Idempotencia por clave del cliente (mismo contenido: mismo registro; distinto: conflicto, `SH-04`).
- [ ] Errores técnicos con código estable (rechazo por tipo, tamaño, páginas, corrupción, almacenamiento), no mensajes de advertencia de contenido. Una imagen ilegible **no** se rechaza por contenido: es una limitación informativa posterior (`SH-03`).
- [ ] Acceso al original: sin URL permanente pública; si se requiere lectura, URL firmada breve solo para el propietario, no cacheable entre usuarios (`SH-07`).
- [ ] Emitir evento de auditoría mediante `MVP-044` (identificadores y hash; sin contenido ni nombre sensible).

### 6.2 MVP-043 — Extracción con procedencia

- [ ] Texto directo: decodificación determinista sin IA, registrada con método `directo`.
- [ ] PDF/imagen: llamada servidor a Gemini mediante el cliente de `MVP-050`, con la evidencia como dato **no confiable** delimitado, sin herramientas, salida estructurada validada con Zod (`SH-08`). Ilegible o ambiguo se marca como limitación; jamás se completa un valor.
- [ ] Persistir extracción separada del original: texto, método/proveedor/modelo, versión de prompt, página o región cuando exista, limitaciones y tiempo del servidor; cada reintento crea otro registro, no sobrescribe. Marca persistida: «interpretada por Gemini; sin verificación visual independiente».
- [ ] Fallo de red/proveedor, configuración ausente o salida inválida: impedimento técnico informado, estado de operación técnica `fallida` reintentable; no se crea extracción ni texto de relleno; el original no se altera.
- [ ] Logs y auditoría con IDs de correlación; sin prompts, texto de documentos ni secretos.
- [ ] Contrato de lectura de extracciones para `MVP-051/053/061` (puerto de servidor); la forma exacta la fija `MVP-020`.

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

### Evidencia de conexión local — 2026-10-16

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
- Base actual integrada: `560edf7` (incluye PR #80 y posteriores #83/#84), sin
  duplicar migraciones anteriores en el diff. Pila galcoa detenida al terminar;
  permanecen únicamente los dos contenedores protegidos `entrenar-*`.
- Incidencia operativa: el primer `supabase start` imprimió su salida estándar
  con configuración efímera local en el registro de herramienta. No se copió
  a archivos/commits ni corresponde a cloud; las operaciones posteriores de CLI
  sensibles capturaron la salida en proceso. No afirmar que nunca hubo salida
  sensible en herramientas. El login SQL de test quedó sin contraseña y la pila
  fue detenida.
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
  No se acredita cancelación de un upload iniciado antes de vencer que termina
  después; SQL tampoco acepta una reserva vencida.
- `001200` incluye la columna de caducidad y el helper Storage; `001201` amplía
  el catálogo SQL después de la primera aplicación local, sin editar migraciones
  publicadas. Ninguna se aplicó en cloud. Sin llamadas a proveedores IA/Hedera,
  sin nuevos servicios/dependencias ni cambios a UI de chat/confirmaciones.

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

Límite de evidencia: pruebas de factory HTTP con Auth local real, no navegador
Next completo ni sesión remota. Build comprueba composición de rutas, no prueba
transporte HTTP Next vivo ni cookies browser de extremo a extremo. Revisión
independiente y sesión final integrada siguen pendientes; #11 queda abierta.

Checks: `lint`, `typecheck`, `npm test`, `test:boundaries` y `build` (rutas y dependencias). **Evidencia (2026-10-16):** `src/lib/documents/evidence/` (inspect, ports, service) y `src/lib/ai/extraction/` (prompt-v1, service con lector); pruebas `tests/server/evidence/` y `tests/server/extraction/` 43/43 con dobles de Storage, base y modelo Gemini (puerto real de MVP-050 con `MockLanguageModelV4`); `npx vitest run --project server` 163, `npm test` 429, lint, typecheck, boundaries 67 y build en verde. Archivos de Files API no hacen falta: cada archivo mide ≤ 10 MiB y la solicitud entra inline (§7.5). Sin llamadas reales. Límites: el conteo de páginas es determinista sin librería (un PDF cuyo árbol de páginas solo está en flujos comprimidos se rechaza como ilegible); el nombre original no se guarda porque la tabla `evidences` no tiene columna para eso. La extracción real con Gemini y Storage remoto no se prueban aquí: requieren autorización y credenciales (`MVP-134/135`); no se leen secretos ni se llama a proveedores. Un fallo de proveedor no se reemplaza con un mock ni con «texto extraído» ficticio. Rollback: revertir archivos del plan; objetos de prueba en Storage local se eliminan con el entorno local.

## 9. Cierre

Se valida tras integrar. Actualizar solo las filas `MVP-042` y `MVP-043` y el recuento del maestro; archivar el plan. Escribir este documento no marca tareas. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 10. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§1, §6 y §7): alcance de fuentes, casos S-01/S-03 y registro abierto de `MVP-010` (formatos, tamaños, páginas, pipeline, metadatos PDF), aún propuesto, no aprobado; `RQ-B2` — [data-transactions](../../../design/data-transactions.md): objetos privados, tablas de evidencia/extracción y orden objeto↔fila.

**Solicitudes:** a `MVP-020` (contratos de evidencia/extracción con proveedor, método, página y limitaciones); a `MVP-024` (políticas de bucket compatibles con subida de servidor y lectura firmada); a `MVP-061` (¿qué metadatos PDF necesita?); a `MVP-054` (consumir el endpoint de extracción tras la carga).

**Decisiones pendientes:** valores de `MVP-010` (parte dependiente: límites y pipeline de PDF/imagen); no hay otras.

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Siguiente en F5: [Proveedor Gemini](f05-gemini-provider.md)

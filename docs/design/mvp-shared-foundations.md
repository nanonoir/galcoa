# Fundaciones compartidas del MVP P0

**Estado: diseño objetivo, no implementación.** Este documento concentra las decisiones transversales para que los planes F0–F13 compartan contratos y límites. Los planes lo citan por `SH-xx`, sin copiarlo ni redefinirlo. El [PRD v1.5](../exec-plans/GALCOA-PRD-v1.4.md) manda sobre producto; la [arquitectura](../architecture.md) sobre capas y propiedad; el [maestro](../exec-plans/active/mvp-master-plan.md) conserva IDs, dependencias y evidencia. La autorización de preparación anticipada consta en [mvp-planning-pack](../exec-plans/completed/mvp-planning-pack.md).

Revisado contra PRD completo, contratos y barreras actuales el 2026-10-16. Solo existen contratos de resumen/dashboard, fixtures y herramientas: este diseño no acredita Auth, SQL, IA, PDF ni HCS funcionales. La ruta `docs/design/` es la solicitada para esta entrega; no se crea una estructura paralela de índices.

## SH-01 — Identidades y ciclo de vida separados

**Decisión:** distinguir documento lógico, borrador mutable, revisión congelada y versión final. No usar «versión» para cada respuesta de IA ni modificar un snapshot al recoger respuestas. Motivo: INV-05, INV-11, INV-14, INV-17–18.

| Entidad / identidad | Contrato y relaciones mínimas |
| --- | --- |
| Documento `documentId` | Propietario, conversación, revisión activa y cadena de versiones; el estado resumido no sustituye esos registros |
| Mensaje / evidencia | Original privado conservado; autor, carga del servidor, fecha declarada separada; evidencia con hash de bytes, ubicación privada y extracciones relacionadas |
| Borrador `draftId`, `draftRevision` | Contenido editable/propuesta y referencias a fuentes/reportes; contador de concurrencia para no congelar una propuesta distinta de la vista |
| Reporte `reportId` | Resultado persistido sobre entradas exactas, fuentes, advertencias, reglas/modelo/prompt y momento; nueva evaluación crea otro reporte |
| Revisión `revisionId` | Pertenece al documento, fija selección y referencia única al snapshot; conserva su ciclo de confirmaciones aunque otra revisión la sustituya |
| Snapshot `snapshotId`, `snapshotHash` | Contenido completo compartible de operación + advertencias completas con referencias seguras + selección fija + `schemaVersion`; serialización canónica inmutable. ID y hash son distintos; el hash no autoriza acceso |
| Invitación `invitationId` | Una por tercero seleccionado/revisión, ligada a `revisionId` + `snapshotId` + hash; token hash, caducidad, revocación/consumo; sin acceso al documento privado |
| Respuesta `responseId` | Autor o tercero/rol, revisión y snapshot exactos, decisión, checkbox, ratificación cuando corresponde, nombre autodeclarado del tercero y tiempo del servidor |
| Versión `versionId`, `previousVersionId` | Una por revisión finalizada; operación del snapshot intacta, constancias, PDF y manifiesto inmutables; estados/intentos de sello en relaciones separadas |
| Operación durable `operationId` | Idempotencia, claim/lease, fase y referencias a artefactos o intento externo; estado técnico, **no** nuevo estado de producto |

`revisionId` no significa `snapshotId`; tampoco se acepta «última revisión» como referencia de una respuesta. Todas las confirmaciones deben resolver al mismo snapshot persistido completo; cada respuesta guarda la referencia inmutable y hash exactos de lo mostrado (no copia mutable ni reconstrucción desde el borrador). Una constraint/FK compuesta impedirá mezclar documento, revisión, snapshot y participante. La selección tiene exactamente las cuatro combinaciones del PRD y siempre autor; se ordena canónicamente, no según orden de clics.

Congelar comprueba `draftRevision` esperado. Cambio material o selección nueva crea otra revisión y sustituye la anterior pendiente, sin heredar respuestas; no se reescribe una finalizada. La conversación puede continuar sin modificar la revisión en espera. Cambiar el contenido compartido de una revisión congelada, incluso para corregir su presentación persistida, exige otra revisión; una simple vista responsive no cambia el contenido. No se delega a una IA decidir la invalidez de confirmaciones.

Las tablas orientativas del PRD §8 no obligan a mezclar revisiones en `drafts`: MVP-022 concreta tablas de revisiones/snapshots y relaciones anteriores; este documento no es un modelo SQL completo ni una migración.

## SH-02 — Contratos versionados y proyecciones explícitas

**Decisión:** Zod + DTO JSON por frontera; reutilizar los enums existentes de [`document.ts`](../../src/lib/contracts/document.ts), no mantener traducciones divergentes. `schemaVersion` identifica las nuevas estructuras persistidas, snapshots, manifiestos y envelopes de API; la versión histórica se conserva al evolucionar el esquema. MVP-020/021 definirán los campos exactos y parsers de versiones. No añadir `schemaVersion` retroactivamente al dashboard sin adaptar sus consumidores y fixtures.

| Familia propuesta en `src/lib/contracts/` | Datos mínimos / consumidor |
| --- | --- |
| Núcleo/documento | Documento, mensajes, evidencia y extracción privadas, borrador con concurrencia; dashboard adapta a `DocumentSummarySchema` actual |
| Revisión | `FrozenOperation` (operación + advertencias seguras completas), selección, IDs/hash, control y avance independientes; autor y terceros comparten **el mismo objeto de operación** |
| Confirmación | Comando con revisión/snapshot/hash esperado, decisión y checkbox; tercero añade nombre, rechazo añade ratificación; resultado idempotente del servidor |
| Versión | Identidad/antecedente, revisión/snapshot, constancias y referencias privadas a artefactos; sello y finalización separados |
| Invitación pública | `schemaVersion`, identificadores opacos de revisión/snapshot, hash, rol propio, selección por roles, operación completa y disponibilidad de respuesta; nunca DTO privado recortado en cliente |
| Verificación pública | Referencia pública opaca, estado de registro, prueba criptográfica no sensible y resultado sobre PDF aportado; no operación, participantes ni constancias |
| Resultados técnicos | Éxito con resultado persistido u operación técnica en curso; error estable con código, etapa, posibilidad de reintentar y correlación no sensible |

**Privacidad sin perder advertencias:** `DocumentWarningSchema.sources` hoy es un array genérico de strings privado; no es un contrato público de fuentes. La proyección usa referencias locales al snapshot, por ejemplo «Fuente A, remito aportado: 12 cajas» frente a «Fuente B, declaración: 10 cajas», con la discrepancia completa necesaria para interpretar la operación. Una tabla privada relaciona esos alias con mensaje/evidencia/página. No publica IDs internos de fuentes, rutas, URLs firmadas, extractos completos, nombres de archivo sensibles, prompts, metadatos ni adjuntos. Las referencias son descriptivas, no enlaces autorizantes.

La proyección compartible se construye **antes** de congelar y es la que ve y confirma también el autor; su panel privado de fuentes queda fuera del contenido acordado. No se redactan advertencias diferentes para terceros ni se oculta una contradicción crítica. Si la salida de IA incorpora instrucciones o información privada ajena a la operación, se corrige la proyección antes de congelarla; no se publica por asumir que todo texto del modelo es compartible. El DTO público se construye por allowlist y valida con esquema estricto; no mediante spread/omit de un registro privado. Tokens, PK privadas de fuentes y claves nunca aparecen en errores/logs/telemetría.

## SH-03 — Tiempo, hashes y significado de los estados

**Decisión:** instantes del servidor en UTC con sufijo `Z` y precisión declarada por contrato; persistencia `timestamptz`, presentación local sin modificar el valor firmado/hasheado. Fecha del hecho: conservar texto original, precisión y zona declaradas; normalizar a UTC solo si hay instante y zona suficientes. Una fecha sin hora o zona no se convierte en medianoche UTC ni se completa por inferencia. Valor desconocido explícito, no fecha de carga como sustituto (INV-09).

SHA-256 opera sobre bytes concretos: original de evidencia, PDF persistido o serialización canónica versionada correspondiente. No hashear texto del PDF extraído ni JSON serializado incidentalmente. MVP-012 especifica codificación, orden, números, nulos, Unicode, orden de colecciones y vectores de prueba; aplica el mismo perfil versionado al snapshot y al manifiesto donde corresponda. No incluir el hash dentro de su propio preimage ni recalcularlo desde un objeto reformateado en cliente.

Los cuatro enums de estado existentes son dimensiones, no un único flujo lineal. Mantener `confirmationStatus`, `revisionId` y `snapshotId` nulos en resumen mientras no haya revisión. Una versión histórica finalizada puede coexistir con un nuevo borrador activo; las proyecciones deben identificar el registro al que se refiere cada estado, no atribuir a la nueva revisión el sello de la anterior. `fallido` describe un intento HCS; sin registro probado la versión sigue «finalizada; sello pendiente» (PRD §5).

**Advertencia ≠ error técnico.** Severidad `critical` nunca deshabilita congelar/confirmar/finalizar. Incertidumbre, unidad ausente, imagen ilegible o discrepancias visuales son limitaciones informativas, sin datos inventados. Fallo de red/proveedor, persistencia, contrato de salida inválido, token/permisos o confirmaciones faltantes detienen solo la etapa afectada, sin fabricar un reporte o éxito. Rechazo es respuesta de negocio persistida y no permite finalizar esa revisión. `loading`, `retrying` y claims son estados técnicos/UI, no valores nuevos del PRD.

## SH-04 — Autoridad transaccional y respuestas idempotentes

**Decisión:** servicios de servidor coordinan; Postgres/RPC impone atómicamente precondiciones, mutaciones y auditoría crítica. Una secuencia de llamadas Supabase desde JS no equivale a una transacción. No hay operaciones externas dentro del bloqueo SQL.

| Transición | Unidad atómica / exclusión necesaria |
| --- | --- |
| Congelar/sustituir | Propiedad, borrador esperado, revisión activa, snapshot/selección, sustitución de enlaces anteriores y auditoría |
| Confirmar autor | Sesión/propiedad, revisión activa, snapshot/hash exactos, respuesta única del autor y auditoría |
| Responder tercero | Token hash válido, revisión activa y caducidad; respuesta + consumo + agregado/auditoría en la misma transacción |
| Reclamar finalización | Todas las confirmaciones persistidas, ninguna negativa, revisión/snapshot activos, claim exclusivo y reserva de identidad de versión/artefactos |
| Publicar versión final | Referencias y hashes de artefactos durables comprobados, claim vigente; inserción inmutable/estado final y auditoría, sin volver a modificar operación |

Todas comparten un orden de bloqueo estable por documento/revisión; constraints de unicidad y comparación de versión/claim respaldan los locks. Una respuesta tardía no revive una revisión sustituida. Si finalización adquirió el claim con todas las respuestas, no se sustituye su entrada mientras produce artefactos; continuar editando el borrador no la altera. Un abandono explícito antes de publicar debe invalidar el claim y sus escrituras tardías; el diseño SQL consumidor concreta esa transición técnica sin crear una confirmación heredada.

Cada mutación repetible recibe una clave de idempotencia acotada al actor/recurso/acción y un fingerprint del comando. Mismo comando devuelve resultado persistido; misma clave con contenido diferente devuelve conflicto. Un token consumido admite consultar el resultado de **su misma respuesta**, no otra decisión ni otra identidad. Confirmar y rechazar concurrentemente producen una sola respuesta. GET no consume ni confirma; cancelar el modal no envía una respuesta. La UI no puede certificar que una persona realmente vio un modal: el servidor exige los campos coherentes de ratificación y la UI prueba la interacción (INV-12–13).

Las RPC internas no conceden a `anon` acceso a tablas ni funciones genéricas privilegiadas. El adapter del servidor valida la capacidad del token; la función restringida vuelve a comprobar sus condiciones atómicas. Funciones privilegiadas, cuando sean necesarias, tienen permisos mínimos, alcance explícito y `search_path` seguro definidos en MVP-022/024; no se usan como bypass general de RLS.

## SH-05 — Finalización durable sin infraestructura adicional

**Decisión:** finalización recuperable por peticiones acotadas, con checkpoints en Postgres y archivos privados; no Redis, cola, microservicio, cron nuevo ni promesa dependiente de un proceso Vercel que siga vivo tras responder. Motivo: REQ-16 y exclusiones P0.

El servicio genera el anexo/PDF **solo después** del claim que comprueba todas las confirmaciones. Reserva `versionId`, identidades de objetos y entradas exactas (snapshot + constancias + versión de renderer). Renderiza fuera de la transacción, persiste bytes canónicos durables y luego publica la versión. Nunca marca `finalizado` solo porque empezó a renderizar o porque obtuvo un hash en memoria.

Contrato de recuperación para MVP-080…083:

- Una fila durable por finalización guarda fase, entradas, claim con vencimiento/fencing, artefacto canónico y error recuperable. La UI consulta estado mediante GET; un POST autenticado de reintento reanuda esa operación, no crea otra versión. Un timeout HTTP no demuestra fallo ni autoriza duplicar trabajo.
- **Un único PDF canónico por versión.** Usar staging durable de los bytes (Postgres si hace falta salvar el intervalo previo a Storage), hash y longitud. Después se copian esos bytes a objeto privado con nombre reservado y sin sobrescritura. La adopción de un artefacto solo es válida bajo claim vigente; un worker tardío no reemplaza al ganador.
- Si upload tuvo éxito y falló el commit de la referencia, el reintento inspecciona el objeto reservado y compara hash/longitud con staging; lo referencia, no vuelve a renderizar. Si falta el objeto, sube los mismos bytes. Ante conflicto de bytes, error técnico, nunca overwrite silencioso.
- No se promete «exactly once» del cálculo ante caída antes de guardar cualquier byte: puede repetirse un render transitorio sin identidad publicada. Una vez aceptados bytes canónicos, ningún reintento los regenera; menos aún un reintento HCS. El diseño consumidor especifica staging/limpieza de huérfanos sin borrar artefactos referenciados.
- Expiración del lease permite recuperación por otra petición con fencing; no basta un booleano `processing` que quede atascado. Las fases permiten detenerse antes del límite de ejecución y devolver «en curso/requiere reintento». Si no cabe la operación mínima dentro del despliegue elegido, se registra la limitación, no se inventa finalización asíncrona garantizada.

No se añaden constancias tardías a PDF publicado. Anexo y manifiesto usan respuestas persistidas, no nombres o timestamps recibidos otra vez del navegador. El sello se coordina después de publicar la versión; su fallo no revierte esa finalización.

## SH-06 — Manifiesto privado, prueba pública y HCS incierto

**Decisión:** el manifiesto tiene un compromiso público mínimo y detalle privado. La prueba pública debe vincular criptográficamente el hash del PDF al hash sellado **sin publicar el manifiesto privado**. No basta comparar PDF con una columna de DB y, por separado, un hash HCS sin vínculo entre ambos (INV-06, INV-15, PRD §9).

Forma estructural acordada para MVP-012/082/100 (serialización exacta pendiente de MVP-012):

```text
detalle privado = snapshot/revisión + evidencias/reportes/constancias/antecedente
                  + hashes correspondientes + nonce aleatorio privado persistido
compromiso público del manifiesto = schemaVersion + pdfHash
                  + privateDetailHash + referencia pública opaca de versión
manifestHash = SHA256(canonical(compromiso público))
HCS = schemaVersion + referencia opaca + manifestHash
```

Es un manifiesto de dos niveles: el detalle relaciona las fuentes exigidas por PRD; el envelope público compromete ese detalle y el PDF. No son dos hashes de raíz alternativos. El nonce evita que un compromiso de datos privados previsibles se trate como anonimización por sí solo. No publicar hashes individuales de evidencias, IDs de usuario/documento privados, nombres, correos, constancias ni rutas; solo hashes e identificadores opacos en HCS. Referencia pública distinta de token de invitación y PK privada.

La proyección pública de prueba entrega el envelope canónico no sensible y localizadores de consenso suficientes para recomputar `manifestHash`; nunca serializa el detalle privado. El servicio compara PDF aportado → `pdfHash`, envelope → `manifestHash`, mensaje recuperado → compromiso esperado y topic/red. Si falta cualquier eslabón o Mirror Node no responde, informa no verificable/pendiente, no éxito. Sin PDF solo estado del registro. El archivo aportado se procesa con límites y no se publica ni persiste por defecto. La disponibilidad del envelope y localizadores forma parte de la persistencia de versión; el PDF original permanece privado.

Antes de enviar HCS, persistir intención, transaction ID, payload exacto y hash, topic/red y ventana de validez; exclusión por versión/intento con claim durable. Un timeout o caída tras envío es **resultado incierto**, no «fallido seguro». Reconciliar de forma acotada por transacción/topic y payload opaco exactos, persistiendo secuencia y consenso comprobados. No escanear contenido privado ni reenviar por mera ausencia inicial en Mirror Node (puede haber retraso).

MVP-012/092 concretan criterios de recibo/Mirror, validez y ausencia concluyente antes de otro intento. Mientras no exista evidencia suficiente, conservar pendiente y reintento de reconciliación disponible al usuario. Un nuevo envío solo tras descartar el resultado anterior bajo esos criterios; no una transacción nueva en cada timeout. Cada intento queda auditado, sin afirmar «registrado» por ejecutar `send`. Ninguna fase produce HCS por confirmación. Reinicio de Testnet se comunica como límite de verificabilidad, nunca permanencia de producción.

## SH-07 — Capas, Auth y ownership de archivos

**Decisión:** conservar el flujo de [arquitectura, dependencias permitidas](../architecture.md#dependencias-permitidas-y-barreras). Los siguientes son dueños de responsabilidad, no autorización para editar fuera del plan/ticket.

| Superficie | Owner futuro / responsabilidad |
| --- | --- |
| `src/lib/contracts/`, `src/lib/rules/` | Líder: contratos compartidos y funciones deterministas; sin SDK/UI/env ni autoridad del cliente |
| `src/lib/supabase/`, `supabase/migrations/` | Líder: persistencia, RPC, RLS, Storage privado y clientes de sesión de servidor |
| `src/lib/ai/` | Líder: extracción/orquestación y reportes; nunca finaliza ni envía HCS |
| `src/lib/documents/` | Líder: servicios de documento/revisión/finalización, PDF, manifiesto y coordinación de confirmaciones; adaptadores de persistencia en Supabase, no SQL en UI |
| `src/lib/hedera/` | Líder: SDK Node Testnet, envío y reconciliación sobre versión persistida |
| `src/app/`, `src/features/*/containers/` | Líder: adapters delgados, autorización y transformación a DTO; containers manejan red/interacción, no secretos |
| `src/features/*/components/`, tests/fixtures locales permitidos | Colaborador frontend solo por allowlist: props y callbacks locales; no red, Auth, SDK ni cálculo de autoridad |
| `src/mocks/`, `tests/`, preview, primitivas/estilos/config/CI | Líder: escenarios, dobles y verificación; nunca fallback productivo |

Server Components leen servicios directamente, no HTTP propio; Route Handlers validan entrada/contexto, llaman servicios y proyectan salida. DTO JSON cruza servidor→container; callbacks ordinarios nacen en cliente, no se pasan desde servidor. No se introduce Server Actions para eludir esa separación. Endpoints exactos pertenecen a los planes consumidores, no al redactor de presentación.

Sesiones mediante cookies SSR; autorización validada en cada operación, además de RLS y políticas de Storage. No confiar solo en guardas de navegación ni en datos de sesión enviados por el cliente. No cachear respuestas privadas/invitaciones entre usuarios, ni filtrar tokens por logs, referrer o recursos de terceros. URLs firmadas, si se necesitan, son breves y solo para el propietario autorizado. Invitación es capacidad acotada, no sesión Supabase de tercero.

**Conflicto de barreras ya identificado:** [`SERVER_DIRS`](../../tests/boundaries/manifest.mjs) marca todo `src/lib/supabase/` como `server-only`. Por ello un eventual cliente Auth navegador **no** se agrega allí ni se importa indirectamente desde esa carpeta. Preferir inicialmente adapters de Auth del servidor; si MVP-030/031 requiere cliente browser, usar una entrada separada propuesta `src/features/auth/containers/supabase-browser.ts`, solo configuración pública, sin barrels de servidor. Actualizar allowlist/tests de barreras con casos positivos y negativos en esa entrega; la presentación sigue sin SDK. No relajar globalmente `SERVER_DIRS` ni quitar `server-only` para que compile.

La guía Next local `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` respalda la frontera serializable. Para implementar Auth/rutas se vuelve a leer la guía local relevante y documentación oficial de las versiones instaladas; aquí no se fija una receta de APIs de cookies/proxy susceptible a cambios.

## SH-08 — IA, extracción y procedencia sin autoridad delegada

**Decisión:** modelos fijados por D-05: Gemini `gemini-3.5-flash-lite` mediante AI SDK/Google; contraste con Groq `openai/gpt-oss-120b` mediante `groq-sdk`. Ni métricas ni contratos permiten cambiar modelos por iniciativa local. `ai`, `@ai-sdk/react` y `groq-sdk` no están instalados en la base inspeccionada; se incorporan con sus consumidores, no se presume integración por dependencias existentes.

Persistir entrada/referencias exactas, salida validada Zod, modelo, versión de prompt/reglas, tiempo del servidor y limitaciones. Original y extracción son registros diferentes; guardar proveedor/método/página o región cuando exista. Los reportes no se sobreescriben al reintentar ni se reconsultan para reconstruir versiones históricas. Un reporte nuevo o corrección de borrador no altera una revisión congelada.

Groq recibe mensajes originales y texto extraído con referencias, no únicamente resumen/borrador de Gemini. Si una foto/PDF fue interpretada por Gemini, Groq puede contrastar esa extracción pero **no** aporta independencia visual ni demuestra fidelidad OCR. Persistir y mostrar esa limitación. Metadatos ausentes/sospechosos son indicadores, no prueba de fraude; la extracción no inventa valores ilegibles.

Texto de chat, PDFs, imágenes/OCR, nombres y metadatos son **datos no confiables**, nunca instrucciones de sistema. Delimitarlos, validar referencias contra las fuentes autorizadas, limitar entrada según MVP-010/013 y rechazar herramientas/acciones sugeridas por el contenido. Los modelos no reciben credenciales, capacidad SQL, Auth ni herramientas HCS; no aprueban, congelan o consumen tokens. La validación Zod no vuelve verdadero un hecho ni reemplaza autorización.

Enviar a proveedores solo fuentes necesarias/autorizadas, sin tokens/URLs firmadas ni secretos. Logs y evaluaciones usan IDs de correlación o datos ficticios, no prompts completos por defecto. Los metadatos/provenance privados se separan de advertencias compartibles (SH-02); cualquier máscara de privacidad conserva la trazabilidad privada y no oculta la discrepancia material en el snapshot común. Uso de datos reales requiere revisión de términos/retención y autorización, no solo que el request funcione.

## SH-09 — Evidencia de validación por frontera

**Decisión:** mocks prueban contratos y comportamiento determinista; no acreditan RLS, proveedores o despliegue. CI por defecto sin llamadas a proveedores ni credenciales cloud. La base Supabase **local** puede usar claves efímeras generadas para tests, sin leer `.env` privado ni usar proyectos remotos.

| Evidencia / ubicación | Casos del PRD §12 y foco |
| --- | --- |
| Vitest Node, `tests/contracts/`, `tests/server/` | §12.2–6, 8–11, 13, 15: parsers, enums, fechas, hashes, estados, versiones, cuatro selecciones, advertencias críticas no bloqueantes, fallos/cancelación y reintentos con dobles |
| Postgres/Supabase local real, harness MVP-120 | §12.1–3, 8–11, 13: migraciones desde cero, RLS y Storage con dos usuarios/anon; RPC concurrentes confirmar/rechazar/sustituir/finalizar, unicidad, append-only e inmutabilidad, fallos entre checkpoints |
| Vitest PDF/HCS/prueba pública con dobles | §12.6–7, 13–14: mismos bytes en reintento, un byte distinto falla, vínculo envelope/HCS, timeout incierto, Mirror retrasado, upload exitoso/commit fallido, no PDF/HCS anticipado |
| Componentes + Playwright en rutas integradas | §12.9, 12, 14–15 y flujo completo de cuatro selecciones: checkbox vacío, rechazo visible/modal/cancelar, contenido idéntico, acceso público separado, navegación y accesibilidad; no sustituye pruebas RLS |
| Barreras + build | Sin SDK/env/servidor en contratos/presentación/preview, entrada Auth browser aislada, sin fixtures en producto, sin inicializar proveedores durante build |
| Evaluación y smoke reales autorizados, fuera de CI default | Dataset etiquetado antes de ejecutar, versiones/modelos/métricas reales; flujo cloud/Testnet y sus límites, sin inferir éxito real desde dobles |

MVP-121 mantiene una matriz de los **15** casos del PRD con tests concretos y huecos; esta tabla distribuye responsabilidad, no afirma cobertura ya existente. Tests concurrentes requieren conexiones/transacciones reales independientes, no solo `Promise.all` contra mocks. F13 verifica ejecución Linux/CI real y protección de ramas/permisos como evidencia separada: archivos de workflow y CODEOWNERS no los activan.

## SH-10 — Decisiones pendientes y documentos consumidores

Este diseño fija estructura y límites, **no** valores operativos arbitrarios ni nuevos requisitos de producto. No hay preguntas que detengan esta preparación documental. Los siguientes detalles siguen abiertos; los planes citan su ID y describen las partes independientes sin fingir que ya se resolvieron.

| ID / detalle pendiente | Impacto y documento concreto recomendado |
| --- | --- |
| MVP-010: formatos, tamaño, páginas, extracción y recursos | Spec técnica acotada para MVP-042/043: matriz por formato/limitación y fallos; no ampliar audio/medios complejos |
| MVP-011: vigencia, abuso, reemisión | Spec de capacidades públicas para MVP-072/075: parámetros configurables y semántica de reemisión/revocación sin heredar decisiones |
| MVP-012: perfil canónico exacto, prueba y reconciliación | Diseño de manifiesto/HCS para MVP-082/090/092/100: concretar SH-03/06, bytes de prueba y criterios ante resultados inciertos |
| MVP-013: parámetros/coste/timeouts/calidad | Spec de evaluación/configuración para MVP-050/053/122/123: distinguir límites técnicos, advertencias y calidad medida; no inventar métricas o umbrales aprobados |
| MVP-022: SQL, seguridad de RPC y staging | Diseño SQL breve con constraints, locks, permisos, fases/leases y recuperación SH-04/05; no duplicar aquí todo el DDL |
| MVP-014: lenguaje jurídico y privacidad | Dictamen externo para uso real/comercial; no impide documentación ni demo ficticia |

Los registros de MVP-010…013 pueden incluir **defaults propuestos, no aprobados**, claramente etiquetados y con alternativas/evidencia pendiente. Sus valores definitivos quedan en el documento consumidor al ejecutar esas tareas con documentación oficial de versiones/planes contratados y validación correspondiente; este diseño no anticipa el resultado. La autorización de credenciales/live solo afecta las tareas que la necesitan. No leer secretos ni realizar llamadas reales durante esta etapa.

Los cuatro redactores son paralelismo **documental** (F0–F3, F4–F6, F7–F10, F11–F13), no cuatro implementadores autorizados. La ejecución futura conserva los dos roles y límites del maestro: líder + colaborador frontend. Este documento no cambia estados, olas ni dependencias del tablero y no exige Issues para empezar trabajo propio del líder.

### Referencias de implementación consultadas

- [Supabase SSR: arquitectura y cookies](https://github.com/supabase/ssr/blob/main/docs/design.md), consultado mediante Context7 el 2026-10-16: separación de clientes/contextos y consistencia de cookies dentro de una petición. Ver también [guía oficial de clientes SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Validar APIs contra versión instalada al implementar, sin copiar recetas de otro framework.
- Guía Next local citada en SH-07; [`document.ts`](../../src/lib/contracts/document.ts), [`dashboard.ts`](../../src/lib/contracts/dashboard.ts) y [manifest de barreras](../../tests/boundaries/manifest.mjs) son la evidencia del contrato **actual**, no del diseño ya implementado.
- [Desarrollo y validación](../development.md): para este cambio solo documental corresponden coherencia, enlaces y diff; no tests de aplicación ni ejecución cloud.

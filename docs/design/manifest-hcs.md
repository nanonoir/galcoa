# Manifiesto privado, prueba pública y reconciliación HCS

**Diseño objetivo, no implementación ni cierre de `MVP-012`** (valores F1 aprobados registrados en §8, con aceptación pendiente). Responde RQ-A4/RQ-C3 para `MVP-070/082/090…093/100`. La estructura de dos niveles ya decidida en [SH-06](mvp-shared-foundations.md#sh-06--manifiesto-privado-prueba-pública-y-hcs-incierto) se concreta aquí con un **perfil v1 propuesto, NO APROBADO** y vectores calculados. Antes de implementar consumidores, `MVP-012` debe registrar su aprobación o ajustes y evidencia. No se marca completa por este documento.

Producto: [PRD §9, INV-03/05/06/15/17/18](../exec-plans/GALCOA-PRD-v1.4.md). Persistencia, claims y permisos: [data-transactions](data-transactions.md). Servidor Node Testnet exclusivamente, sin llamadas live ni secretos en esta entrega.

## 1. Un compromiso raíz, dos niveles

```text
PDF canónico durable ── SHA-256 ── pdfHash ───────────┐
detalle privado + nonce ── JCS/SHA-256 ── detailHash ─┤
referencia pública opaca + schemaVersion ────────────┤
                                                    ↓
                       envelope público canónico ── SHA-256 ── manifestHash
                                                                    ↓
                         HCS: schemaVersion + reference + manifestHash
```

No es suficiente comparar PDF con una columna SQL y consultar un hash HCS independiente. El envelope público vincula **el hash del PDF aportado** al hash raíz realmente recuperado de HCS. El detalle privado compromete fuentes/constancias/antecedente sin revelarlos. `privateDetailHash` no prueba por sí solo contenido que el visitante no tiene; prueba que ese compromiso no cambió.

### Contratos del perfil v1 propuesto

| Registro | Campos exactos / contenido |
| --- | --- |
| `galcoa.snapshot.v1` | `schemaVersion, content: {operation, warnings, selection}` (forma de `FrozenOperationSchema`; `content` es el preimage de `snapshotHash`; `selection` es la selección de roles). Operación completa y advertencias seguras completas, sin chat/evidencias/PK privadas. No incluye su propio hash ni respuestas posteriores. `MVP-021/062` concreta los esquemas internos; no introducir un objeto libre `unknown`. |
| `galcoa.private-detail.v1` | `schemaVersion, versionId, revisionId, snapshotId, snapshotHash, evidences, reports, confirmations, previousVersion, nonce`. Todo privado; arrays/objetos definidos abajo. |
| `galcoa.manifest.v1` | **Solo** `schemaVersion, reference, pdfHash, privateDetailHash`. Este envelope, no el detalle, define el `manifestHash`. |
| `galcoa.hcs.v1` | **Solo** `schemaVersion, reference, manifestHash`. Payload HCS canónico UTF-8. Nada de operación, datos de participante, URL o hash individual de evidencia. |

Detalle privado:

- `evidences`: `{evidenceId, sha256}` por original utilizado, sin rutas/URLs firmadas. Distinguir hash de original de hash de extracción.
- `reports`: `{reportId, sha256, sources}`; `sha256` de bytes canónicos persistidos del reporte versionado, `sources` con referencias privadas tipadas a mensaje/evidencia/extracción y página/región cuando exista. No volver a consultar un modelo para reconstruirlo.
- `confirmations`: `{responseId, role, snapshotHash, decision, checkbox, declaredName, ratifiedRejection, respondedAt}` desde respuestas persistidas; `declaredName:null` para autor si no corresponde, requerido para **ambas decisiones** de tercero. Una versión final solo contiene decisiones de confirmación de todos los seleccionados. Identificador de autor queda privado, resoluble desde la respuesta persistida, no correo en envelope.
- `previousVersion`: `null` para primera versión, o `{versionId, manifestHash}` de la versión publicada anterior resuelta bajo lock del claim, incluso si su sello sigue pendiente. No requiere que la anterior esté en HCS.
- `nonce`: **privado**, 32 bytes CSPRNG (tamaño aprobado por el usuario) codificados en 64 hex minúsculas (codificación: decisión técnica local); nunca existe un nonce público. Se genera una sola vez en la reserva durable y no se publica. Evita probar diccionarios de detalle previsible sin conocer el nonce; no convierte datos personales en anónimos ni permite publicar los hashes individuales.

Propuesta de `reference` (función distinta del nonce privado; identificador opaco, no un nonce público): 16 bytes CSPRNG, 32 hex minúsculas y unicidad SQL; distinta de `versionId`, PK del documento y token de invitación. Es pública/no autorizante; no da acceso al PDF. Entropía/longitudes son parte del perfil **pendiente** de `MVP-012`, no parámetros ya aceptados. No derivarla de nombre/correo/contenido, ni usar token de tercero como referencia.

El detalle privado, nonce, envelope y sus bytes/hashes se guardan antes de publicar versión; referencia/envelope permanecen disponibles para el verificador aunque el detalle sea inaccesible públicamente. No añadir `manifestHash` a su propio preimage. El PDF no puede contener el hash de un manifiesto que a su vez depende de ese PDF: puede mostrar referencia pública/ruta de verificación, no un ciclo de hashes. Intentos HCS y sus localizadores quedan fuera del detalle para no alterar la raíz después del envío.

## 2. Perfil canónico propuesto: RFC 8785/JCS

Elegir JCS evita inventar un serializador dependiente del orden de inserción de JS o del pretty-print de `jsonb`. Especificación [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), consultada el 2026-10-16. Aplicar el mismo perfil a snapshot, reporte comprometido, detalle privado, envelope y payload. SHA-256 sobre bytes, representado como 64 hex minúsculas sin prefijo.

| Tema | Regla de bytes del perfil propuesto |
| --- | --- |
| Objetos | Solo JSON plano validado con esquema estricto. Claves únicas; rechazar duplicadas al parsear entrada JSON antes de perderlas en un objeto. Orden recursivo lexicográfico por unidades UTF-16, independiente de locale; no `localeCompare`. |
| Codificación | JCS → UTF-8 sin BOM, espacios de formato ni salto final. Escapes de strings según JCS/ECMAScript. Guardar bytes originales canónicos, no reconstruirlos desde `jsonb` para publicar histórico. |
| Unicode | Conservar secuencia exacta; no NFC/NFD, trim ni sustitución de saltos de línea durante hash. Rechazar surrogates sueltos. Una corrección deseada ocurre antes de congelar y se muestra a todos; no como normalización invisible posterior. |
| Números | Importes, cantidades exactas y secuencias HCS grandes como **strings decimales**, sin pasar por `Number`. Mantener representación acordada de importe (`"10.00"` no se transforma en `"10"`). Números JSON solo contadores/índices enteros seguros; rechazar fracciones fuera de campos string, NaN, infinito y enteros inseguros antes de serializar. JCS serializa `-0` como `0`; el dominio no usa `-0` para hechos. |
| Valores ausentes | `null` explícito en campos requeridos cuyo valor es desconocido; array vacío para conjunto vacío. No `undefined`, huecos de array, `BigInt`, `Date`, `toJSON` personalizado ni coerciones. `null` y campo ausente no equivalen: manda el esquema versionado. |
| Tiempo | Instantes de aplicación en `YYYY-MM-DDTHH:mm:ss.sssZ`, precisión milisegundos fijada **al capturar** el dato canónico; SQL conserva ese instante. No redondear después del hash. Fecha declarada mantiene texto/precisión/zona; no completar zona desconocida. Consenso Hedera conserva por separado string exacto `seconds.nanoseconds` de nueve decimales, nunca `Date` con pérdida de nanos. |
| Colecciones | JCS no reordena arrays. Antes de congelar: `selection` (dentro de `content`; el comando `freeze_revision` la recibe como `selectedRoles`) y constancias en orden `autor, intermediario, comprador`; rechazar duplicados. Evidencias/reportes por ID UTF-16; fuentes por tupla tipo/ID/página/región canónica. Advertencias por ID estable; alias de fuentes locales estables. Párrafos, mensajes y líneas de operación conservan el orden semántico persistido, no se ordenan alfabéticamente. |
| Versionado | Cada preimage incluye su discriminante `schemaVersion`. Cambiar campos/normalización requiere versión nueva y parser histórico explícito. No recanonicalizar v1 con reglas v2, ni aceptar versión desconocida como v1. |

La proyección compartible y su orden se construyen **antes de `freeze_revision`**; autor/terceros confirman ese objeto completo exacto, no proyecciones recalculadas. ID/hash/snapshot son distintos. `MVP-070` depende de este perfil igual que `MVP-082`: resolverlo solo al generar el manifiesto sería demasiado tarde. Límites de tamaño/profundidad/cantidad de campos deben fijarse en `MVP-010/012/013`; no hashear JSON ilimitado ni truncar advertencias para caber.

### Vectores de bytes calculados, no evidencia de dominio implementado

Calculados el 2026-10-16 con Node `node:crypto.createHash('sha256')` en el árbol de trabajo. Los bloques siguientes son **una línea UTF-8, sin newline final**. El PDF de prueba es solo un preimage sintético de 15 bytes, no un PDF renderizado válido. El detalle usa arrays vacíos y snapshot `{}` para aislar la cadena; **no pasa las precondiciones de publicación**. Añadir fixtures de dominio válidos al implementar `MVP-012/082`.

**V0, serialización:** entrada equivalente con claves desordenadas, `n:1.0` y texto `\u00e9` debe producir:

```json
{"a":null,"amount":"10.00","n":1,"text":"é"}
```

45 bytes; SHA-256 `7bb015f4bf985ad10d7ddecc34049888a4e0eaf14305f376be1c13d6f5ab3643`.

**V1, PDF sintético:** bytes hex `255044462d312e370a2525454f460a` (`%PDF-1.7\n%%EOF\n`). SHA-256 `1e7313ace78f0fb481a486939b4885902663102818090805515553d84e0bbfd3`.

**V2, detalle privado sintético:** snapshot preimage `{}` (2 bytes), hash `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.

```json
{"confirmations":[],"evidences":[],"nonce":"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f","previousVersion":null,"reports":[],"revisionId":"r-fixture","schemaVersion":"galcoa.private-detail.v1","snapshotHash":"44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a","snapshotId":"s-fixture","versionId":"v-fixture"}
```

345 bytes; `privateDetailHash = bc0c645b44cccdb9194c703e0763a3f532e571a56f354c79d171ea0718f0f24a`.

**V3, envelope público:**

```json
{"pdfHash":"1e7313ace78f0fb481a486939b4885902663102818090805515553d84e0bbfd3","privateDetailHash":"bc0c645b44cccdb9194c703e0763a3f532e571a56f354c79d171ea0718f0f24a","reference":"000102030405060708090a0b0c0d0e0f","schemaVersion":"galcoa.manifest.v1"}
```

249 bytes; `manifestHash = 71190077727205270fbc7017d8302e7869696ec5b034a2cf54008fe373eeef0b`.

**V4, payload HCS:**

```json
{"manifestHash":"71190077727205270fbc7017d8302e7869696ec5b034a2cf54008fe373eeef0b","reference":"000102030405060708090a0b0c0d0e0f","schemaVersion":"galcoa.hcs.v1"}
```

162 bytes; hash de payload `b6bf58e8651e69e00cf6d3926ec1b41f0aa7c897de2812a29fbb42583064e1d1`. Este hash identifica la intención; **no** es otro `manifestHash`.

### Vectores de dominio sintéticos (reproducibles, 2026-10-16)

Calculados offline con un script temporal de Node 24 (`node:crypto`; JCS mínimo con orden UTF-16 de claves, solo strings/enteros seguros/null/arrays/objetos), sin red ni `.env`, y **no commiteado**: cuando se implemente `MVP-082`, el helper real de `src/lib/documents/manifest/` debe reproducir estos valores. Usan datos ficticios y la forma del contrato actual `FrozenOperationSchema` (`operation`, `warnings`, `selection`), con las tres confirmaciones. Los esquemas internos definitivos son de `MVP-021/062`; si cambian, se recalculan.

**V5, contenido congelado** (preimage de `snapshotHash`; 451 bytes): `{"operation":{"body":"Se entregan 12 cajas de ejemplo el 2026-10-01. Precio no informado.","corrections":["Ortografía: «entregan»"],"title":"Acuerdo ficticio de entrega"},"selection":["autor","intermediario","comprador"],"warnings":[{"id":"w-1","message":"Chat indica 10 cajas; remito indica 12.","severity":"critical","sources":[{"alias":"Fuente A","description":"chat: 10 cajas"},{"alias":"Fuente B","description":"remito aportado: 12 cajas"}]}]}`; `snapshotHash = 736a8da7c6c9257c313c1580dbc42dc88c17b3db4de868a24f41d255fbefe804`.

**V6, detalle privado de dominio** (1369 bytes): `evidences` con un `{evidenceId:"e-1", sha256: SHA-256("original-1")}`, `reports` con `{reportId:"rep-1", sha256: SHA-256("report-1"), sources:[{type:"message",id:"m-1",page:null,region:null}]}`, tres `confirmations` (`c-1` autor con `declaredName:null`; `c-2` intermediario «María Ñandú»; `c-3` comprador «Juan Pérez»; todas `decision:"confirmar"`, `checkbox:true`, `ratifiedRejection:false`, `respondedAt` `2026-10-16T12:00:00.000Z`, `…12:01:00.000Z`, `…12:02:00.000Z`), `previousVersion:null`, mismo `nonce` y mismos `versionId/revisionId/snapshotId` que V2 y `snapshotHash` de V5. `privateDetailHash = d4cc79a41dc83a2c5d2cffa7bc5267be2a8d475763064032fdf100ec567a4a03`.

**V7, envelope** (249 bytes; PDF de V1, `reference` de V3, `privateDetailHash` de V6): `manifestHash = 699b15c9f13b20aed9f2a3a5905ba0d7feb9f151c7930cff940a073d591d7590`.

**V8, payload HCS** (162 bytes; `manifestHash` de V7): hash de payload `164e65d41726232960bbdc6bb49b090dc8c6c57e8cc103d76688cad6ee6d5508`.

Comprobaciones negativas ejecutadas en el script: `é` (U+00E9) frente a `e`+U+0301 dan hashes distintos; cambiar un byte del PDF cambia su hash; invertir el orden de las claves de entrada no cambia el resultado; cambiar el orden de `selection` cambia el hash. **Siguen sin cubrirse** claves duplicadas, surrogates sueltos, NaN/infinito, enteros inseguros y versión desconocida (pruebas futuras de `MVP-012/082`) ni la conformidad JCS completa (RFC 8785 §3.2 y apéndice B).

**Alineación resuelta (2026-10-16):** la selección se llama `selection` y vive dentro de `content`, como en `FrozenOperationSchema`; la tabla de §1 y la regla de orden de §2 ya lo reflejan. Es solo una corrección de nombres en el diseño: V5–V8 no cambian (sus bytes ya usaban `selection`).

**Reproducción de V0–V8:** con Node 24, `node:crypto` y un JCS mínimo (claves ordenadas por unidades UTF-16; solo strings, enteros seguros, null, arrays y objetos), serializar cada preimage descrito arriba a UTF-8 sin newline final y aplicar SHA-256 en hex minúsculas, en el orden V5 → V6 (con el `snapshotHash` de V5) → V7 (con el `privateDetailHash` de V6) → V8 (con el `manifestHash` de V7). No hay helper ni test de repositorio todavía; lo agrega `MVP-082`.

Tests negativos requeridos: `é` U+00E9 frente a `e`+U+0301 dan bytes/hash distintos; cambiar un byte del PDF cambia V1/V3/V4; reordenar claves no cambia el resultado; reordenar líneas semánticas sí; invertir roles como conjunto produce el orden definido antes de congelar; nombres duplicados de clave, surrogate suelto, NaN/infinito, unsafe integer y versión desconocida fallan. Añadir vectores de orden UTF-16 y números de RFC 8785 §3.2 y apéndice B: estos cinco vectores no prueban conformidad JCS completa.

## 3. Origen de confianza del registro

**No aceptar un topic/URL/red del visitante ni un mensaje idéntico en un topic arbitrario.** Una persona puede publicar el mismo hash en su propio topic; no sería un registro emitido por esta aplicación.

Decisión estructural: topic Testnet con **submit key** controlada por el servidor. Propuesta operativa mínima: usar la clave pública del operador como submit key, sin otra credencial si no hace falta; su custodia/aprovisionamiento siguen pendientes de autorización `MVP-134`. «Topic privado» en la documentación de Hedera significa escritura restringida, **no** confidencialidad del mensaje. No enviar PII aunque haya submit key.

Persistir con cada intento la referencia a configuración de confianza versionada: `{network:"testnet", epochId, topicId, submitKeyFingerprint, mirrorOrigin}`. `epochId` identifica el despliegue/época de Testnet configurado, no una prueba criptográfica de la red. Mantener allowlist histórica del servidor con topics y origen Mirror HTTPS confiables; cambios de topic/red no redirigen versiones antiguas silenciosamente. Los localizadores de un registro comprobado son inmutables. La allowlist/configuración no se toma de un payload SQL modificable por el propietario. Mirror default propuesto: `https://testnet.mirrornode.hedera.com`; no URL libre del navegador, redirecciones arbitrarias ni loopback habilitado en producto para pruebas.

La confianza es en la emisión de la aplicación, la red consultada y el operador de Mirror configurado; no es un cliente ligero con prueba de consenso independiente. Compromiso de claves, DB administrativa o Mirror es un límite explícito, no algo que un hash resuelva. No aceptar un nuevo topic que reutiliza números tras un reset como si fuera el anterior.

## 4. Intención durable antes de cualquier envío

`MVP-090` posee el adapter SDK; `MVP-091/092` la coordinación y RPC de [data-transactions](data-transactions.md). Interfaces internas objetivo, sin tipos SDK cruzando dominio:

| Interfaz | Forma / responsabilidad |
| --- | --- |
| `prepareSubmission` | Versión publicada + configuración confiable → `{transactionId, validStart, validDurationSeconds, signedBytes, signedBytesHash, payloadBytes, payloadHash, network, topicId, epochId}`. Construcción/firma locales, **sin enviar**. |
| `submitPrepared` | Intención persistida + claim vigente → observación `submitted/definitive_failure/unknown`, nunca «registrado» solo por ejecutar. Usa los mismos bytes/ID. |
| `observeTransaction` | ID persistido → recibo/record tipado y evidencia asociada o desconocido/indisponible. No genera otro ID. |
| `readTopicMessage` | Topic/secuencia de configuración confiable → mensaje/consenso/metadata validada o clasificación de indisponibilidad/discrepancia. |
| `reconcileSeal` | Intención + observaciones → `registered/keep_pending/terminal_failure/integrity_error`; SQL guarda transición y auditoría bajo fencing. |

Orden obligatorio:

1. Reclamar una operación de sello para versión **ya publicada**, con PDF/envelope/hashes durables. Un intento activo por versión. Obtener configuración confiable; navegador no elige topic/payload.
2. Preparar transacción de mensaje único: ID explícito, validez, nodos, payload exacto, memo vacío/no sensible, freeze y firma. Persistir intención completa y bytes firmados **antes** de `execute`. Si falla ese commit, no enviar. Los bytes firmados son capacidad de envío/coste: privados, nunca logs, auditoría pública o DTO.
3. Bajo claim vigente marcar «puede haberse enviado» antes de salir a red. Una caída en ese intervalo deja incertidumbre conservadora, incluso si aún no se envió. No mantener lock SQL durante red.
4. Enviar esa transacción con reintentos SDK acotados **sin regenerar ID**, sin rechunking y sin cambiar bytes/payload. El payload v1 cabe en un único mensaje: rechazo técnico si excede el límite de mensaje único, no habilitar chunks automáticos que creen más efectos. Si expira el claim durante envío, el resultado se reconcilia por el mismo intento; no nace otro ID por vencer el lease.
5. Persistir observaciones bajo fencing. Un proceso viejo puede haber enviado a Hedera aunque SQL ya no le permita escribir; Hedera no reconoce el fencing SQL. La seguridad depende de mantener el mismo ID/bytes del intento y prohibir nuevos intentos mientras exista incertidumbre. Nunca afirmar exactly-once de la llamada de red.

APIs verificadas en documentación oficial: `TopicMessageSubmitTransaction`, `freezeWith(client)`, `sign(key)`, `TransactionReceiptQuery().setTransactionId(id).execute(client)`, `getReceipt(client)` y control de regeneración de ID. Serializar/restaurar transacción con `toBytes`/`Transaction.fromBytes` se valida además contra tipos de la versión **instalada** `@hiero-ledger/sdk` antes de implementar; no copiar setters con capitalización de Java desde una tabla multilenguaje. El adapter prueba round-trip offline y comprueba que el SDK no cambie ID al reintentar. Nada de `execute` durante build ni de herramientas HCS para agentes.

## 5. Reconciliación: desconocido no es ausencia

La política segura P0 es conservar incertidumbre sin deadline artificial. Reconciliación por petición autenticada acotada; `GET` no envía. Plazos **aprobados por el usuario el 2026-10-16** (ver §8): hash 5 s; envío HCS y recibo 20 s; cada consulta Mirror 10 s; total de 30 s, que es la espera interactiva de la **verificación Mirror** (incluye sus consultas y pausas). Ese total no suma el envío de 20 s ni el hash de 5 s: esos tiempos no entran en su contador. Un timeout desconocido queda **pendiente** y no se reenvía hasta reconciliar. Vencer un plazo solo termina la petición, **no** prueba que no hubo registro.

| Evidencia | Clasificación / acción permitida |
| --- | --- |
| Preparación local o commit de intención falló, sin ninguna posibilidad de envío | Fallo técnico no enviado. Repetir preparación bajo claim, sin modificar PDF/manifiesto. |
| Precheck `OK` o respuesta de `execute` | Aceptación preliminar, no consenso. Mantener pendiente y consultar. |
| Timeout, desconexión, cancelación, 5xx, `UNKNOWN`, `RECEIPT_NOT_FOUND`, `RECORD_NOT_FOUND`, Mirror 404 | Incierto/indisponible. Conservar mismo intento y reconciliar; no nuevo envío con ID diferente. |
| `DUPLICATE_TRANSACTION` | Puede reflejar envío previo; buscar resultado del mismo ID. No tratar como fallo definitivo sin efecto. |
| Receipt/record `SUCCESS` del ID exacto con secuencia | Evidencia de consenso para ese intento; guardar observación. Falta comparar mensaje/topic/consenso en Mirror antes de publicar `registrado` bajo este diseño. |
| Mirror de transacción exacta exitosa y mensaje coincidente | Correlacionar ID, consenso, topic y secuencia; comparar payload canónico exacto, referencia y hash esperado. Registrar sello solo con toda esa evidencia, no buscando cualquier mensaje igual. |
| Receipt/record terminal de fracaso de **ese ID** sin efecto HCS | Intento fallido comprobado y auditable. Se puede preparar otro intento, mismo payload/versión, ID nuevo, solo después de persistir esa conclusión bajo lock. |
| Error local/precheck definitivo antes del primer envío, sin ningún envío previo incierto | Corregible/reintentable como no enviado. Si ya existió envío posible, el error de un nodo no descarta el anterior. |
| `TRANSACTION_EXPIRED` observado al reenviar, ventana vencida o muchos 404 | No prueba que el ID no alcanzó consenso antes. Conservar incierto si falta evidencia terminal; no corte «a los N minutos se reenvía». |
| Mensaje/record encontrado pero contenido/topic/consenso/referencia difiere | Discrepancia técnica: no registrado, no reenvío automático. Conservar observación mínima y diagnóstico privado. |
| Topic/secuencia antes probados ya no disponibles, posible reset Testnet | No verificable actualmente; conservar prueba/localizadores históricos y comunicar límite, no éxito actual ni reconstrucción silenciosa. |

Para éxito: recibo/record de transacción más mensaje Mirror deben vincular el ID preparado al `consensus_timestamp` y secuencia. Endpoint oficial de mensaje `GET /api/v1/topics/{topicId}/messages/{sequenceNumber}` devuelve `topic_id`, `sequence_number`, `consensus_timestamp`, `message` codificado y metadata. Validar Zod, base64/UTF-8 estrictos, límites y respuesta; secuencias int64 sin pérdida de precisión (parser lossless o rechazar fuera de rango seguro, no redondear). Correlacionar el registro de transacción por ID con ese consenso; no confundir payer con identidad del participante. Conservar timestamps de nanos como string. `getReceipt` puede lanzar por status: el adapter debe clasificar el resultado tipado/excepción, no mapear toda excepción a fracaso seguro.

Si se perdió para siempre la evidencia del ID antiguo, queda **pendiente indefinidamente**, con reconciliación manual/operador e incidente visible. El operador no tiene un botón que declare ausencia por intuición; ninguna política autoriza otro envío sin evidencia suficiente. No se promete ausencia concluyente a partir de un índice Mirror, de un reset ni de la expiración de retención de recibos.

Estados públicos conservan el PRD: `no_iniciado`, `pendiente`, `registrado`, `fallido` para intento. Versión sigue finalizada y se muestra «Versión finalizada; sello pendiente» mientras no haya registro comprobado. Observaciones técnicas (`prepared`, `unknown`, etc.) no agregan estados de producto. Después de registrar no se regenera PDF/manifiesto ni se emite HCS por confirmación.

## 6. Verificación pública y resultados

`MVP-100` consume la proyección pública restringida y el lector `MVP-093`, sin duplicarlos. Entrada `{reference, pdfBytes?}`; salida JSON por allowlist `{schemaVersion, reference, registrationStatus, envelope?, manifestHash?, locators?, integrityResult?, reasonCode?}`. `locators` solo red/topic/época pública, transacción, secuencia y consenso, nunca nonce/clave/ruta privada. IDs de documento, participantes y fuentes no aparecen en DTO ni errores. Referencia inexistente: respuesta externa no verificable, sin enumeración privada.

Orden de verificación con archivo:

1. Resolver referencia opaca y envelope versionado persistido; validar esquema/bytes/límites. El request no aporta un envelope/topic alternativo como autoridad.
2. Calcular SHA-256 de bytes del PDF aportado; comparar con `envelope.pdfHash`. Una diferencia definitiva da `discrepancia`, aun si luego Mirror está caído; no afirmar que se comprobó HCS en ese caso.
3. Recomputar hash de envelope canónico, comparar con `manifestHash` persistido; validar referencia idéntica y configuración histórica de confianza. No reconstruir desde detalle privado ni publicar sus hashes individuales.
4. Consultar Mirror confiable por localizadores persistidos; comprobar mensaje completo `galcoa.hcs.v1`, referencia/hash, red/topic/época esperados, secuencia/consenso y vínculo con transacción. Coincidencia de texto en otro topic o URL no cuenta.
5. Solo si todos los eslabones coinciden: `integridad comprobada`. Archivo igual pero sello pendiente, evidencia incompleta, Mirror indisponible/rezagado o reset: `no verificable`. Mismatch comprobado de un eslabón: `discrepancia`. No convertir indisponibilidad en integridad ni en acusación de falsedad.

Sin archivo: `integrityResult` ausente; solo estado del registro, con disponibilidad actual si Mirror fue consultado. Nunca «archivo verificado». Textos base: «Integridad del archivo comprobada respecto del registro», «El archivo o la prueba no coincide con el registro esperado», «No es posible comprobar la integridad ahora; sello pendiente o evidencia de red no disponible». Añadir Testnet puede reiniciarse e integridad no acredita verdad factual/identidad.

PDF aportado no sale hacia Hedera/IA/Mirror, no se publica/persiste por defecto, ni se registra su nombre/contenido/hash en telemetría. Procesamiento en memoria/stream limitado y validado en servidor; límite final compatible con PDF generado y cuerpo del despliegue depende de `MVP-010/012/132`. No reemplazar unilateralmente upload por un hash calculado en cliente para sortear el límite. Invitar y verificar son capacidades/rutas distintas; verificador no responde confirmaciones, no reintenta sello y no expone PDF privado.

## 7. Ownership, validación y pendientes

| Owner | Entrega que consume este diseño |
| --- | --- |
| `MVP-021/012` | Esquemas versionados/perfil aprobado y vectores de dominio válidos; sin SDK/env en contracts. |
| `MVP-070` | Snapshot canónico compartido antes de confirmar. |
| `MVP-081/082/083` | PDF staged, detalle/nonce/envelope durables, publicación inmutable. Helpers de hash/canonicalización en `src/lib/documents/manifest/`; funciones puras aisladas de SDK. |
| `MVP-090/093` | SDK Node Testnet y lector Mirror único en `src/lib/hedera/`, APIs comprobadas contra versión instalada, configuración confiable y pruebas offline. |
| `MVP-091/092` | Intención/claims, reconciliación, clasificación de observaciones, auditoría; migraciones aditivas coordinadas con F2. |
| `MVP-100/101` | Comparador/allowlist/DTO público y UI separada de invitación. |
| `MVP-120/121/134` | Dobles en `tests/server/`, matriz de cuatro selecciones y evidencia real autorizada; límites de navegador en [data-transactions §7](data-transactions.md#7-costuras-de-tests-y-evidencia). |

Validación futura: vectores JCS; un byte distinto; mismo PDF/hash tras reintento; nonce único persistido; payload sin centinelas PII; intención committed antes de enviar; dos claims/un intento; worker viejo; timeout antes/después de enviar; SDK intenta regenerar ID; duplicado; receipt success con Mirror retrasado; 404 prolongado sin reenvío; transacción fallida comprobada; Mirror falso/topic atacante; reset/reutilización de secuencia; sin PDF solo estado; verificación no altera DB/HCS. Tests locales/dobles no acreditan Hedera real. No se ejecutaron SDK/red/RLS ni tests de aplicación en esta entrega documental.

Pendientes **sin resolver por esta propuesta**: aprobación del perfil, entropías, límites y parámetros de reconciliación (`MVP-012`); límites de PDF/JSON y recursos/deadlines (`MVP-010/013/132`); retención legal de nonce/detalle/bytes firmados (`MVP-014`); aprovisionamiento autorizado del topic/submit key, allowlist histórica/época y configuración (`MVP-134`). No rotar nonce histórico para «anonimizar»: cambia el compromiso; eliminación legal puede impedir abrir el detalle pero no reescribe la huella HCS. No hay promesa de permanencia Testnet.

## 8. Registro de decisiones F1 — MVP-012

**Estado:** aprobado por el usuario el 2026-10-16 (primera tanda, [`hackathon-team-first-wave`](../exec-plans/active/hackathon-team-first-wave.md)). **No cierra MVP-012**: faltan pruebas y elementos de aceptación (§8.3). El perfil v1 de §1–2 y los vectores calculados siguen vigentes como propuesta concretada.

### 8.1 Valores aprobados

| Tema | Valor aprobado |
| --- | --- |
| Canonicalización y hash | JCS (RFC 8785) + SHA-256 |
| Nonce privado | 32 bytes (no existe nonce público; la `reference` opaca de 16 bytes es otra función) |
| Red | Solo Testnet |
| Contenido en HCS | Solo hashes e identificadores opacos |
| Plazo de hash | 5 s |
| Envío HCS y recibo | 20 s |
| Consulta Mirror | 10 s cada una |
| Total de verificación Mirror | 30 s de espera interactiva, incluyendo sus consultas y pausas; no suma envío (20 s) ni hash (5 s) |
| Timeout desconocido | Queda `pendiente`; no se reenvía hasta reconciliar |

**Aclaración aprobada por el usuario:** el nonce es solo **privado** (32 bytes) y jamás existe un nonce público. La `reference` opaca de 16 bytes cumple otra función (identificador público no autorizante) y no es una brecha ni se cambia a 32 bytes; el perfil y los vectores V0–V4 no cambian.

### 8.2 Validez de la transacción — revisión de documentación

- La documentación oficial de Hedera consultada establece una ventana de validez de **hasta unos 180 s** desde `validStart` para aceptar una transacción.
- El SDK instalado (`@hiero-ledger/sdk`) usa por defecto `transactionValidDuration` de **120 s**.
- Los plazos aprobados (envío y recibo 20 s; verificación Mirror 30 s) caben dentro de ambas.

**Resolución técnica (2026-10-16, líder técnico delegó decisiones locales compatibles; no es una aprobación humana):**

- **Validez:** se fija `validDurationSeconds = 120`, el valor por defecto de la versión instalada del SDK (`DEFAULT_TRANSACTION_VALID_DURATION = 120` en `node_modules/@hiero-ledger/sdk`), por debajo del máximo documentado de ~180 s. Se persiste con la intención (`validStart` + `validDurationSeconds`) para conocer la expiración exacta. `MVP-090` confirma contra el SDK que no cambie; si cambiara, el valor persistido es el que manda. Un plazo de aplicación (30 s) no es la validez de la transacción.
- **Ausencia concluyente:** que Mirror o el recibo no muestren la transacción **nunca** prueba por sí sola que no hubo efecto: es «desconocido». «Sin efecto» exige **ambas** condiciones: (a) expiración de validez conocida y ya vencida según los valores persistidos, y (b) un recibo/record que clasifique definitivamente la transacción como no ejecutada (p. ej. un estado terminal de fracaso de ese ID). Sin (a)+(b) queda `pendiente`, sin reenvío automático con otro ID. No se finge ausencia con 404 prolongados, `RECEIPT_NOT_FOUND` ni retención de Mirror.
- **Mientras el SDK/red no confirmen lo anterior,** solo hay reconciliación **manual controlada** por el operador, que no declara ausencia por intuición (§5).

### 8.3 Qué impide cerrar MVP-012

El líder debe resolver o aceptar:

1. (Resuelto: nonce solo privado de 32 bytes; `reference` de 16 bytes es otra función, §8.1.)
2. (Resuelto técnicamente en §8.2: validez 120 s persistida y criterio de ausencia concluyente; solo falta aceptarlo y confirmarlo contra SDK/red en `MVP-090`, que es una prueba futura.)
3. (Resuelto: los 30 s son la espera interactiva de verificación Mirror y no suman envío ni hash; al agotarlo: pendiente, §5.)
4. Límites de tamaño/profundidad del JSON canónico y de PDF (`MVP-010/013/132`); aprovisionamiento del topic/submit key (`MVP-134`); retención legal (`MVP-014`).
**Pruebas futuras (no son pendientes de decisión).** Vectores JCS completos (RFC 8785 §3.2 y apéndice B), intención antes del envío y no reenvío ante incertidumbre se implementan con `MVP-090…092`; ninguna se ejecutó y no hubo llamadas a Hedera. La decisión documental de F1 no exige pruebas de consumidor/runtime ni verificar disponibilidad de cuentas antes de implementar.

Hasta que se resuelvan o acepten los puntos 2 y 4, `MVP-012` permanece `pendiente` en el maestro (no se cierra automáticamente); este registro no actualiza su fila.

## Fuentes oficiales consultadas (2026-10-16)

- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785): strings intactos, orden UTF-16, arrays, números y UTF-8; no es un requisito de normalización NFC.
- Hedera vía herramientas oficiales: [freeze/firma](https://docs.hedera.com/native/transactions/unsigned), [transaction ID](https://docs.hedera.com/native/transactions/transaction-id), [campos/reintento](https://docs.hedera.com/native/transactions/modify-fields), [receipt](https://docs.hedera.com/native/transactions/receipt), [record](https://docs.hedera.com/native/transactions/record), [códigos](https://docs.hedera.com/reference/network-responses), [submit message](https://docs.hedera.com/native/consensus/submit-message), [topic con submit key](https://docs.hedera.com/native/tutorials/consensus/private-topic), [Mirror por secuencia](https://docs.hedera.com/api-reference/topics/get-topic-message-by-id-and-sequence-number). Respaldan distinguir precheck/consenso/incertidumbre y mensaje público con escritura restringida; no prueban funcionamiento de la aplicación.
- Las páginas multilenguaje muestran límites/firmas que deben contrastarse con red y SDK instalados al implementar; este diseño no usa máximos de validez publicados como prueba de ausencia ni receta de retry. Versión declarada del SDK: [`package.json`](../../package.json), no integración existente.

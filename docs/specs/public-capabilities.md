# Capacidades públicas: alcance, secretos y abuso

**Estado objetivo P0; implementación y MVP-011 pendientes.** Autoridad: [PRD v1.5](../exec-plans/GALCOA-PRD-v1.4.md), §3–6, §8–12, §16; REQ-11…14,16/17; INV-11…15. Fundaciones canónicas: [SH-01/02/04/06/07/10](../design/mvp-shared-foundations.md).

Esta capacidad se separa de la [revisión/confirmación](review-confirmation.md): aquí se define qué autoriza un enlace, cómo pierde vigencia y cómo se protege contra abuso, no el contenido de una decisión. Diseño consumidor: [SQL](../design/data-transactions.md) y [manifiesto/HCS](../design/manifest-hcs.md), en preparación.

## 1. Dos accesos que no se intercambian

| Acceso | Autoriza | Nunca autoriza |
| --- | --- | --- |
| Invitación `confirm/[token]` | Leer la operación compartible completa de una revisión y responder por el rol de ese tercero | Chat, evidencia, PDF privado, otro rol/revisión, sesión de usuario o privilegios de autor |
| Verificación `verify/[reference]` | Consultar estado del registro y comprobar integridad del PDF aportado | Confirmar/rechazar, obtener operación o constancias personales, descargar archivos privados |

El hash del snapshot no concede acceso. Referencia pública de versión, token de invitación e identidades privadas no son intercambiables. No hay sesión Supabase del tercero ni lectura genérica de tablas públicas para eludir las capacidades.

La posesión del enlace identifica una declaración mediante ese enlace, no prueba quién es la persona ni que sea el comprador/intermediario real. La capacidad es acotada, no una autenticación reforzada.

## 2. Emisión y visibilidad del secreto

El propietario autenticado puede emitir una invitación por tercero elegido y revisión activa. Cada una tiene token aleatorio de alta entropía, hash almacenado, caducidad, un solo uso y revocación; entropía y vigencia numéricas quedan abiertas en MVP-011.

**El token en claro se muestra únicamente al emitirlo y en la previsualización de compartir de esa emisión.** Permite copiar, QR, WhatsApp y `mailto:`. No hay recuperación posterior desde la base ni endpoint para reconstruir un secreto hasheado. Refrescar/perder esa vista no permite «volver a copiar» el token anterior desde el servidor.

La petición pública necesariamente transporta el token para usarlo; no se refleja por ello en contenido, errores o telemetría. Logs de acceso/aplicación e instrumentos de observabilidad deben evitar capturar el segmento secreto.

Texto ante pérdida: «Este enlace no puede recuperarse. Podés emitir otro; el anterior dejará de aceptar respuestas». La UI debe advertir la revocación antes de reemitir. La página del propietario puede mostrar estado/rol/caducidad, no el secreto almacenado.

## 3. Vigencia y reemisión

| Estado de capacidad | Lectura/acción observable |
| --- | --- |
| Válida y revisión activa | Muestra snapshot autorizado; GET no consume; permite respuesta coherente |
| Vencida | «Enlace vencido. Solicitá uno nuevo al autor»; no acepta respuesta |
| Revocada | «Este enlace ya no está disponible»; no acepta respuesta |
| Revisión sustituida | «Esta revisión fue sustituida. Solicitá la revisión vigente»; no revive la anterior |
| Consumida | No permite otra decisión/identidad; repetición de la misma respuesta devuelve resultado ya persistido |
| Token desconocido/malformado | «Enlace no disponible»; no revela existencia de documento privado |

Leer repetidas veces o abrir un preview del mensajero no consume ni extiende vigencia. La fecha del cliente no reemplaza la validación del servidor. La respuesta valida estado y revisión dentro de la misma unidad atómica que su consumo.

Recuperar idempotentemente el resultado de una respuesta ya aceptada no es aceptar una respuesta nueva: puede devolver ese resultado propio aunque después venza o se sustituya la revisión, sin reabrir capacidad ni divulgar decisiones ajenas (diseño SQL §3).

Reemitir para una solicitud pendiente rota la capacidad y revoca la anterior, preservando su historia y snapshot. No transfiere respuestas ni crea otra revisión por sí solo. Una revisión sustituida requiere la invitación de la revisión nueva, no reactivar la vieja.

Una respuesta ya persistida no se borra/sobrescribe al reemitir: no se entrega un segundo voto sobre la misma solicitud. Para cambiar contenido/selección o recoger nuevas confirmaciones se prepara otra revisión conforme review-confirmation.

La reemisión es idempotente: reintento del mismo comando no genera múltiples capacidades activas ni revoca una posterior por una respuesta tardía. Si se perdió el plaintext de una emisión ya comprometida, no fingir que puede recuperarse para repetir la visualización; consultar su estado y solicitar explícitamente otra emisión que revoque aquella. La idempotencia no justifica almacenar el secreto en claro.

## 4. Compartición manual y privacidad

- QR contiene el mismo enlace de esa invitación, no uno genérico compartido entre terceros.
- Copiar, `wa.me` y `mailto:` preparan acciones del dispositivo; no prueban entrega ni envían mensajes desde el backend.
- No colocar tokens en recursos de terceros, analítica, mensajes de error, logs ni cabeceras referrer. Las páginas con capacidad no cargan recursos que filtren el secreto.
- Evitar cache compartida entre capacidades/usuarios; una respuesta anterior no debe mostrar el snapshot de otro enlace.
- No persistir tokens en claro para facilitar UI o auditoría. Auditoría usa referencias no autorizantes y resultados, no el secreto.
- Enlaces revocados/sustituidos no muestran información privada adicional para explicar el error.

## 5. Prevención de abuso y disponibilidad

Lectura/respuesta de invitación, emisión/reemisión y verificación pública tienen control del servidor adecuado a su coste. La verificación con PDF además aplica validación técnica de tipo/tamaño/recursos; el archivo se procesa sin publicarlo ni persistirlo por defecto.

La protección debe ser coherente entre instancias y reinicios de Vercel: **no basta un contador en memoria del proceso**. Según SH-04/07 y exclusiones P0, el diseño consumidor concreta control durable en Postgres o infraestructura disponible aprobada, sin incorporar Redis ni otro servicio por iniciativa local.

El presupuesto de abuso no sustituye autorización, unicidad, RLS ni transacción. Alcanzar el límite produce rechazo técnico seguro/reintentable según política; no consume el token como si fuese una respuesta ni inventa confirmaciones.

No revelar tokens o datos privados para identificar un límite. La indisponibilidad del mecanismo no debe producir éxito ficticio ni abrir un bypass silencioso; su política operacional concreta queda en MVP-011.

## 6. Verificación y afirmaciones de confianza

Sin PDF: solo «Estado del registro», nunca «archivo verificado». Con PDF: verificar bytes → compromiso público/manifiesto → mensaje HCS recuperado y red/topic según SH-06 y diseño de manifiesto. Comparar con una columna de base y mostrar aparte un registro HCS sin vínculo no prueba la cadena.

Resultados: «Integridad comprobada», «Discrepancia» o «No verificable», según prueba disponible. Falta de envelope/localizadores, Mirror inaccesible, resultado incierto o reset de Testnet no es éxito. La prueba pública no revela operación, chat, evidencias o constancias. Un byte diferente falla integridad.

No afirmar verdad factual, identidad verificada, firma digital ni permanencia de producción por un registro Testnet. No hay HCS adicional por abrir o responder una invitación.

## 7. Aceptación trazable — a implementar

| Caso | Positivo / negativo esperado | MVP / PRD §12 |
| --- | --- | --- |
| P-01 | Un enlace por tercero/revisión; no accede a otro rol, chat ni archivos | 072/073; 8,9 |
| P-02 | GET repetido/preview no consume; vencido/revocado/sustituido no responde | 073/074; 8,11 |
| P-03 | Respuesta+consumo atómicos, misma repetición devuelve resultado, opuesta no duplica | 074/075; 8 |
| P-04 | Rotación conserva historia y revoca previo; solicitud usada no sobrescribe respuesta; pérdida no recupera hash | 011/072/078; INV-12/13 |
| P-05 | Copiar/QR/WhatsApp/mailto usan la misma capacidad sin envío backend ni fugas | 078/130; REQ-14/17 |
| P-06 | Límite aplicado entre instancias; petición limitada no consume como respuesta | 011/075/100/130; REQ-16/17 |
| P-07 | Sin PDF solo estado; PDF alterado falla; Mirror caído no afirma integridad ni filtra datos | 100/101; 7,14 |

## 8. Registro de decisiones F1 — MVP-011

**Estado:** decisión documental de F1 (`MVP-011`) **completada y aprobada el 2026-10-16** (primera tanda, [`hackathon-team-first-wave`](../exec-plans/completed/hackathon-team-first-wave.md); plan [`f01-decisiones-confirmacion-y-sello`](../exec-plans/completed/f01-decisiones-confirmacion-y-sello.md) archivado). Resoluciones técnicas locales aceptadas por el orquestador; nombre autodeclarado de 200 caracteres incorporado en contratos; pruebas corresponden a tareas consumidoras (`MVP-072…075`).

### 8.1 Valores aprobados

| Parámetro | Valor aprobado | Nota |
| --- | --- | --- |
| Entropía del token | 32 bytes aleatorios (CSPRNG) | Token **privado** de invitación; nunca se publica ni se usa como referencia pública |
| Almacenamiento | Solo hash en base de datos | El token en claro se muestra solo al emitirlo (§2) |
| Vigencia | 72 h, configurable | Contada desde la emisión; GET no la renueva |
| GET | Nunca consume el token | §3 |
| Respuesta y consumo | Atómicos e idempotentes | Misma repetición devuelve el resultado ya persistido |
| Reemisión | Invalida el token anterior | Conserva historia; no transfiere respuestas |
| Cambio material | La respuesta **no se hereda**: se crea otra revisión | review-confirmation, INV-12/13 |
| Lecturas | 60 por minuto | Configurable |
| Escrituras | 10 por minuto por origen | Configurable |
| Mecanismo | Postgres; sin servicio nuevo (sin Redis) | Coherente entre instancias y reinicios (§5) |

Consideraciones (derivadas, no cambian los valores):

- **Origen y red compartida:** varias personas pueden compartir una misma IP (oficina, red móvil, NAT); un límite por origen puede limitar a inocentes. Por eso se aprobó configurable y con cuidado; la clave exacta del «origen» y su combinación con la capacidad no están definidas.
- **No prometer de más:** el límite reduce abuso básico, no impide ataques distribuidos ni sustituye autorización, unicidad ni RLS (§5). No presentarlo como protección completa.
- **Ámbito no precisado por el usuario:** no consta si las 60 lecturas/min son por origen, por token o globales, ni qué abarcan las 10 escrituras/min; §8.1.1 propone una resolución técnica local, pendiente de aceptación (§8.2).
- Una petición limitada no consume el token (P-06) y la indisponibilidad del mecanismo no abre un bypass silencioso.

### 8.1.1 Detalles técnicos locales (decisión de implementación, **no aprobados por una persona**)

Resueltos de forma conservadora y compatible con las specs para poder implementar; cualquier ajuste es de configuración o de una constante y no cambia los valores aprobados de §8.1.

| Tema | Decisión técnica local |
| --- | --- |
| Representación del token | base64url sin relleno de los 32 bytes (43 caracteres, alfabeto `A-Za-z0-9_-`); malformado = «Enlace no disponible» sin consultar la base |
| Ventana | Fija de 60 s, alineada al minuto; contador durable en Postgres |
| Clave | Origen derivado del encabezado de IP que provee la plataforma, almacenado solo como hash; contador separado por clase (lectura/escritura). No incluye el token ni datos privados |
| Lecturas (60/min) | GET de invitación y consulta de verificación sin PDF |
| Escrituras (10/min) | Emisión/reemisión, respuesta de invitación y verificación con PDF |
| Límite excedido | HTTP `429` con `Retry-After`, mensaje genérico, sin consumir el token ni revelar qué clave se limitó |
| Fallo del mecanismo | Cierra en falla: `503` reintentable, sin éxito ficticio ni bypass |
| Retención | Solo contadores de ventanas recientes; sin token ni IP en claro |
| Origen confiable | Solo el encabezado de IP que provee la plataforma de despliegue (Vercel); el cliente no lo puede fijar. Detrás de NAT compartido, varios usuarios comparten contador: límite configurable (§8.1) |
| Nombre autodeclarado | Texto sin espacios en los extremos, no vacío, **máximo 200 caracteres** (puntos de código tras `trim`); sin patrón de identidad ni normalización Unicode. El contrato (`src/lib/contracts/confirmation.ts`, `DeclaredNameSchema`, reutilizado en `ReceiptSchema`) aplica `trim`, `min(1)` y máximo 200 puntos de código |

### 8.2 Qué impide cerrar MVP-011

El líder debe resolver o aceptar:

1. Aceptar o ajustar ámbito, clave, ventana, retención, respuesta `429` y fallo del mecanismo propuestos como decisión técnica local en §8.1.1 (no aprobados por una persona).
2. Aceptar la representación base64url del token (§8.1.1). La referencia pública es otra función: 16 bytes opacos, ver [manifest-hcs](../design/manifest-hcs.md) §1.
3. Nombre autodeclarado: aceptar el máximo técnico de 200 caracteres (§8.1.1) y añadirlo al contrato compartido (hoy falta; es del líder).
4. Límites del verificador público con PDF (coordinados con MVP-010/013 y [manifest-hcs](../design/manifest-hcs.md)).
**Pruebas futuras (no son pendientes de decisión).** Fronteras temporales de 72 h, concurrencia de respuesta/consumo, reemisión idempotente y límite entre instancias se implementan con sus funcionalidades; ninguna se ejecutó. La decisión documental de F1 no exige pruebas de consumidor/runtime ni verificar disponibilidad de cuentas antes de implementar.

MVP-012 resuelve cadena/canonicalización en manifest-hcs; política jurídica de datos reales sigue MVP-014. Hasta que se resuelvan o acepten los puntos 1–4, `MVP-011` permanece `pendiente` en el maestro (no se cierra automáticamente); este registro no actualiza su fila.

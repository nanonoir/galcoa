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

## 8. Registro operativo abierto — MVP-011

**Defaults propuestos, NO APROBADOS. No hay duración, cuota ni entropía numérica decididas aquí.**

| Parámetro | Propuesta de partida / alternativa | Evidencia para finalizar F1 |
| --- | --- | --- |
| Entropía/representación | Generación criptográfica aleatoria y representación apta URL | Elegir bits/longitud/formato y validar generación/almacenamiento sin secretos expuestos |
| Caducidad | Vigencia configurable desde emisión, sin renovación por GET | Elegir intervalo por uso de demo y riesgo; probar fronteras temporales/concurrencia |
| Reemisión | Rotar pendientes revocando anterior; no sobrescribir utilizadas | Aprobar experiencia de pérdida/reintento y prueba concurrente con idempotencia |
| Abuso | Controles separados por capacidad/acción y contexto de origen, durables | Elegir claves, ventanas, cuotas, retención, respuesta y comportamiento ante fallo; medir coste sin exponer secretos |
| Cobertura de verificador | Incluir lectura y PDF por sus costes distintos | Fijar límites coordinados con MVP-010/013 y diseño de manifiesto |
| Nombre autodeclarado | No vacío tras espacios; sin patrón de identidad | Fijar máximo y normalización segura sin excluir nombres legítimos |

Al ejecutar F1, el líder registra en este apartado valores definitivos, fundamento/documentación vigente, pruebas positivas/negativas, alternativas y aprobación fechada; actualiza referencias consumidoras. MVP-012 resuelve cadena/canonicalización en manifest-hcs; no se cierra aquí ni con esta preparación. Política jurídica de datos reales sigue MVP-014.

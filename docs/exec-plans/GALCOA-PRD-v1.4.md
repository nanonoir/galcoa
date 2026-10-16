# GALCOA+ — PRD de producto

> **Versión 1.5 · 16/10/2026 · MVP único para NEA TECH y evolución SaaS**
>
> PRD actualizado: autonomía máxima con advertencias, selección optativa de participantes y confirmaciones obligatorias antes del PDF final y HCS; se conserva el nombre del archivo para mantener las referencias.
>
> **Estado:** acuerdos de producto incorporados. Las reglas y comportamientos definidos son vinculantes; este PRD no prescribe el orden de tickets ni un cronograma de implementación.

## 0. Stack acordado — resumen ejecutivo

| Capa | Tecnología elegida | Rol dentro del MVP |
| --- | --- | --- |
| Aplicación full-stack | **Next.js 16 (App Router) + React + TypeScript** | UI, Server Components, Route Handlers y lógica de servidor |
| Diseño | **Tailwind CSS v4 + shadcn/ui** | Componentes accesibles y responsive |
| Login, registro y sesiones | **Supabase Auth + `@supabase/ssr`** | Identidad real, recuperación y manejo de sesiones por cookies |
| Base de datos | **Supabase PostgreSQL** | Documentos, conversaciones, evidencias, auditorías y versiones |
| Archivos privados | **Supabase Storage** | PDFs finales y evidencias originales |
| Agente 1 (generación) | **Vercel AI SDK (`ai`, `@ai-sdk/google`) + `gemini-3.5-flash-lite`** | Extraer evidencias multimodales, conversar y redactar |
| Agente 2 (verificación) | **`groq-sdk` + `openai/gpt-oss-120b`** | Contrastar el contenido con fuentes textuales independientes de la propuesta |
| Validación de contratos | **Zod** | Esquemas tipados y controles de formato |
| Blockchain | **Hedera Consensus Service (HCS) + `@hiero-ledger/sdk`** | Sello de huellas en Testnet y comprobación en Mirror Node |
| PDFs | **`@react-pdf/renderer`** | Creación del PDF final desde el snapshot aprobado |
| Despliegue web | **Vercel** | Hospedar la única aplicación Next.js |
| Suscripciones posteriores | **Mercado Pago**; **Stripe** opcional | Fuera de P0 |
| Gestor de paquetes | **npm** | Dependencias y `package-lock.json` en un solo repositorio |

**Exclusiones decididas para P0:** Better Auth, Prisma, Resend, Cloudflare R2, microservicios, Redis, sistema propio de correo, smart contracts ejecutables y cobros reales. No hay prototipo Node/HTML distinto de la aplicación definitiva. **Los modelos están decididos:** Gemini 3.5 Flash-Lite para generación y GPT-OSS 120B servido por Groq para contraste. La extracción de texto/OCR y límites operativos concretos se especifican en tickets sin alterar el alcance.

### Límite importante de correo

Supabase Auth gestiona el flujo de emails de autenticación **sin Resend**, utilizando inicialmente el servicio integrado. Ese emisor es solo apropiado para pruebas y destinatarios autorizados, y tiene límites estrictos (actualmente hasta 2 correos/hora por proyecto). Para abrir registros públicos de producción habrá que configurar SMTP, aunque no forma parte de este MVP.

---

## 1. Visión

GALCOA+ es una plataforma de documentación autónoma de operaciones mediante conversación. Una persona describe una operación y aporta evidencias en un chat; Gemini prepara un documento claro con la menor intervención posible y GPT-OSS contrasta su contenido con las fuentes disponibles. La plataforma resuelve errores menores y expone dudas, omisiones y contradicciones materiales como advertencias, sin inventar datos ni bloquear por ellas. El autor elige quiénes deben confirmar la misma revisión congelada: solo autor, autor e intermediario, autor y comprador o los tres. Tras todas las confirmaciones se incorporan sus constancias, se genera la versión final inmutable y se registra su huella en **Hedera Consensus Service (HCS)**.

**Unidad central del producto:** un chat persistente corresponde a un documento lógico y conserva sus mensajes, evidencias, revisiones y versiones. Cada modificación posterior continúa en ese chat y puede producir una versión nueva sin sobrescribir las anteriores.

**Propuesta de valor:** menos documentación manual, menos errores no detectados, historial auditable y verificación de integridad accesible a terceros. La blockchain no garantiza que el dato original sea verdadero.

El MVP es **una aplicación real y única**, no una maqueta separada ni un prototipo descartable. La demo del Ideatón utiliza esa misma aplicación y datos de prueba.

## 2. Usuarios y casos de uso

**Usuario principal:** operador o responsable de una microempresa, pequeña empresa, laboratorio de ensayo, distribuidora, establecimiento agroindustrial o negocio con necesidad de documentar transacciones y controles.

**Primeros flujos demostrables:**
1. **Entrega comercial:** el usuario describe cantidades, productos, destinatario y condiciones, incorpora un remito y genera una constancia/documento de operación.
2. **Registro de medición o control:** el usuario describe la medición y agrega una evidencia. El sistema distingue los hechos aportados de los que no tienen respaldo.

Estos son **ejemplos de una misma experiencia documental**, no aplicaciones separadas ni esquemas rígidos que impidan otros documentos. No construir módulos completos de logística, inventario, laboratorios o contabilidad en el MVP. Los terceros corroborantes participan sin cuenta mediante enlaces acotados a una versión y nunca acceden al chat.

## 3. Flujo de extremo a extremo (autonomía por defecto)

1. El usuario se autentica realmente con Supabase Auth, crea un documento y comienza un chat persistente.
2. Cuenta la operación con lenguaje natural, agrega información y, opcionalmente, evidencias (texto, PDF e imágenes sencillas en el primer alcance). La app registra los mensajes originales y conserva los archivos privados.
3. **Agente 1 — Gemini 3.5 Flash-Lite:** extrae hechos, cita su procedencia y redacta **de forma autónoma un documento claro y suficiente**. Corrige errores ortográficos o de formato inocuos sin consulta y deja trazabilidad del ajuste. No inventa precios, cantidades, nombres, fechas ni voluntades.
4. Ante huecos, dudas o contradicciones, la IA continúa redactando con la información disponible y expone advertencias materiales explícitas y sus fuentes. No completa datos por inferencia ni exige respuestas para continuar; el autor puede aclarar voluntariamente por chat.
5. **Agente 2 — GPT-OSS 120B en Groq:** contrasta el borrador con mensajes originales y contenido textual extraído de las evidencias, sin depender únicamente del resumen del Agente 1. Reporta `sin_inconsistencias_criticas_detectadas`, `con_advertencias` o `contradiccion_critica`, con referencias a fuentes. Son resultados informativos, nunca un veto a la revisión o confirmación ni prueba de verdad.
6. Los controles de atribución, procedencia y consistencia señalan omisiones, cargas tardías, registros retroactivos agrupados, valores repetidos o metadatos sospechosos **como indicadores, no como prueba de fraude**. Solo impedimentos técnicos, de seguridad, permisos o confirmaciones faltantes impiden avanzar en la etapa afectada.
7. El autor revisa el documento completo, correcciones relevantes y advertencias. La IA puede sugerir participantes, pero el autor elige **solo autor, autor + intermediario, autor + comprador o los tres**. Se congela el contenido de operación y la selección para esa revisión antes de recoger confirmaciones.
8. Todos los seleccionados ven **el mismo contenido completo de operación congelado**, incluidas sus advertencias materiales, sin chat ni evidencias privadas. El autor confirma desde su sesión; cada tercero recibe un enlace privado individual de un solo uso, también representable como QR, compartido manualmente por WhatsApp, email o en persona. No se requiere cuenta para terceros ni proveedor de envío.
9. Para confirmar se marca una casilla inicialmente vacía y se pulsa **«Confirmar»**; el tercero escribe además su nombre completo autodeclarado. Con la casilla desmarcada se ofrece **«No coincide / Rechazar»**, acción secundaria visible y accesible que exige ratificar en un modal. El rechazo no exige declarar conformidad. Se registra respuesta, revisión, snapshot exacto mostrado y fecha; no constituye identidad verificada ni firma digital.
10. **Primero deben persistirse todas las confirmaciones seleccionadas.** Si solo se eligió al autor, basta su confirmación final. Un rechazo impide finalizar esa revisión y permite abrir otra. Abrir el enlace mediante GET no consume el token; su consumo y la respuesta se persisten atómicamente, con resultado idempotente ante doble clic o reintento.
11. Solo después se incorporan las constancias como anexo, **sin cambiar el contenido de operación acordado**; se genera el PDF final, el manifiesto y sus hashes, y se envía su huella a **Hedera HCS (Testnet)**. En P0 no hay sellado previo ni mensajes HCS adicionales por confirmación. Si HCS falla, la versión queda finalizada con sello pendiente; se reintenta con el mismo PDF/hash, reconciliando antes cualquier resultado incierto.
12. Un cambio material del contenido o de los participantes exige una nueva revisión y todas sus confirmaciones desde cero, sin arrastrar las anteriores; los enlaces de la revisión sustituida dejan de aceptar respuestas. Las versiones finalizadas son inmutables: cualquier cambio posterior crea una nueva versión en el mismo chat, sin sobrescribir las anteriores. Una devolución posterior no significa que la entrega original fuera falsa.
13. El verificador público es distinto de la invitación: comprueba el PDF presentado y su cadena de hashes con HCS, sin publicar archivos, chat ni evidencias privadas. Sin PDF muestra solo el estado del registro y no afirma haber verificado el archivo.

**Regla de producto:** ser autónomo no equivale a certificar hechos externos. **El objetivo es claridad documental con mínima fricción**, evidencias trazables y afirmaciones de confianza proporcionadas a las fuentes disponibles.

## 4. Requisitos funcionales del MVP (P0)

| ID | Funcionalidad | Criterio de aceptación |
| --- | --- | --- |
| REQ-01 | Supabase Auth | Registro, login, logout y sesiones reales; cada usuario accede solo a sus documentos. |
| REQ-02 | Dashboard e historial | Crear y reabrir documentos con conversaciones persistentes y estados. |
| REQ-03 | Chat por documento | Un chat es un documento lógico; se conservan mensajes y contexto de versiones. |
| REQ-04 | Evidencias | Cargar texto, PDF e imágenes simples; originales privados, metadatos y hashes. Audio y medios complejos son posteriores. |
| REQ-05 | Agente 1 autónomo | Gemini 3.5 Flash-Lite redacta, resuelve trivialidades y explicita datos ausentes o contradictorios sin inventarlos ni exigir aclaraciones. |
| REQ-06 | Agente 2 verificador | GPT-OSS 120B vía Groq SDK contrasta fuentes textuales y reporta discrepancias críticas o advertencias; no aprueba por sí mismo. |
| REQ-07 | Reglas base ALCOA+ | Controles deterministas proporcionales; advertencias de anomalías históricas sin presuponer fraude. |
| REQ-08 | Confirmaciones de revisión | Autor siempre incluido; selección fija y todas las confirmaciones ligadas al mismo snapshot completo. Advertencias incluso críticas no bloquean. |
| REQ-09 | PDF y versión inmutable | Solo tras todas las confirmaciones: anexo de constancias sin cambiar la operación, PDF final, manifiesto y hashes; cambios posteriores crean nueva versión. |
| REQ-10 | Hedera HCS | Sello real del hash mediante topic en Testnet y vínculo verificable a cada versión. |
| REQ-11 | Verificador público | Separado de invitaciones; verifica integridad al aportar PDF. Sin PDF solo informa estado del registro, sin afirmar verificación del archivo ni filtrar datos privados. |
| REQ-12 | Selección optativa, confirmación obligatoria | El autor elige solo autor, autor + intermediario, autor + comprador o los tres; cada tercero tiene token/QR propio para la revisión. Elegirlo obliga a obtener su confirmación antes de finalizar. |
| REQ-13 | Pantalla pública de corroboración | Sin login; operación completa idéntica al snapshot del autor, nombre autodeclarado, checkbox vacío; confirmar marcado o rechazar desmarcado con modal. Rechazo visible/accesible impide finalizar esa revisión. |
| REQ-14 | Compartir manualmente | Copiar enlace, QR presencial, abrir WhatsApp o `mailto:`; sin enviar correos ni WhatsApp desde el backend. |
| REQ-15 | Auditoría y estados | Registra propuestas, autoría, correcciones, advertencias, aprobación, corroboraciones, intentos HCS y rechazos, sin alterar registros previos. |
| REQ-16 | Robustez | GET no consume tokens; respuesta y consumo atómicos e idempotentes. Errores técnicos no fabrican confirmaciones; fallo HCS conserva versión finalizada y sello pendiente, mismo PDF/hash y reconciliación previa al reintento incierto. |
| REQ-17 | Seguridad | RLS, buckets privados, claves solo servidor, tokens de confirmación aleatorios, caducidad y uso único. |
| REQ-18 | Pruebas | Tests deterministas del flujo crítico y conjunto inicial de evaluación de agentes con errores y casos correctos. |

**Mejoras posteriores (P1):** audio/transcripción, extracción sofisticada de imágenes y PDFs escaneados, envío automático de invitaciones, autenticación reforzada de terceros/OTP, organizaciones y roles avanzados, reglas especializadas por sector, pagos Mercado Pago (Stripe opcional), Hedera Mainnet, firmas digitales con validez específica y eventual validación GAMP 5.

**No se imponen modelos rígidos de contratos ni cuestionarios exhaustivos.** Los criterios documentales orientan la redacción y las advertencias; no son campos obligatorios que impidan finalizar por falta de datos. El PRD define el alcance, no el orden de implementación.

### Criterios iniciales de suficiencia documental (no bloqueantes)

- **Entrega comercial:** identificar, si fueron aportados, las partes, producto, cantidad/unidad, fecha, destino y condiciones de entrega o pago. Diferencias de cantidad, precio, destinatario o condiciones son materiales y se explicitan. Ejemplo: chat «10 cajas» y remito «12 cajas» → mostrar ambas cifras y fuentes como contradicción, sin elegir una ni detener la confirmación; fecha ausente → indicar «fecha no informada».
- **Medición/control:** distinguir objeto o muestra, magnitud, valor/unidad, momento del hecho, responsable, método y evidencia cuando se aporten. Ejemplo: valor «7» sin unidad → advertir unidad no informada sin inventarla; valores diferentes entre chat y evidencia → conservar la discrepancia visible; carga posterior al hecho → separar ambas fechas y señalarla sin presumir fraude.
- **Advertencia material:** ausencia, ambigüedad o discrepancia que puede cambiar la interpretación de la operación o sus compromisos. Se muestra explícitamente en el contenido compartido para confirmar; no equivale a impedimento técnico.
- **Impedimento de etapa:** no poder recuperar o persistir el snapshot, generar el PDF o comunicarse con un proveedor necesario; acceso no autorizado, token inválido o confirmaciones faltantes. Informar la causa sin simular éxito. Un rechazo mantiene esa revisión sin posibilidad de finalizar; una nueva revisión permite continuar. Un fallo HCS no deshace la finalización: deja pendiente únicamente el sello.

### Límites de actuación de los agentes

- **Gemini** admite texto, imagen, audio y PDF, aunque el MVP habilita solo los formatos que el pipeline procese de forma confiable.
- **GPT-OSS 120B en Groq recibe texto, no imágenes ni audio.** Su verificación de fotos depende de texto extraído previamente; el sistema no debe proclamar una comprobación visual independiente cuando no la hubo. Las evidencias privadas quedan accesibles al autor, no al tercero; el contenido compartido distingue hechos respaldados, declarados y no verificables.
- Zod valida estructura y el código aplica las reglas de negocio. Ni un «visto bueno» del Agente 2 ni la ausencia de advertencias prueban por sí solos un hecho real.
- Los prompts y proveedores se pueden mejorar sin alterar los contratos de negocio ni reemplazar verificaciones históricas.

## 5. Estados: documento, verificación, corroboración y blockchain

Los estados pertenecen a **dimensiones distintas** y no se sustituyen entre sí:

| Dimensión | Valores conceptuales |
| --- | --- |
| Documento | `borrador`, `listo_para_revision`, `esperando_confirmaciones`, `revision_rechazada`, `revision_sustituida`, `finalizado` |
| Control documental | `sin_evaluar`, `con_advertencias`, `contradiccion_critica`, `sin_inconsistencias_criticas_detectadas` |
| Sello HCS | `no_iniciado`, `pendiente`, `registrado`, `fallido` |
| Confirmaciones de revisión | `pendiente`, `parcial`, `completa`, `rechazada`, `sustituida` (siempre incluyen al autor) |
| Procedencia | `declarado_por_autor`, `declarado_y_corroborado_por_tercero` (si corresponde) |

- La selección queda fija al congelar la revisión; `completa` significa que todos los seleccionados confirmaron ese snapshot. Solo con esa condición puede generarse la versión final y enviarse a HCS. Si se eligió solo autor, se identifica como declaración sin corroboración de terceros.
- Una confirmación por link acredita **una declaración realizada mediante ese enlace**, no identidad presencial verificada ni verdad absoluta de la operación.
- Las respuestas se vinculan a una **revisión y snapshot exactos**. Cambio material o de selección crea otra revisión sin confirmaciones heredadas; enlaces pendientes anteriores quedan sustituidos y no aceptan respuestas.
- Un rechazo lleva a `revision_rechazada`: no puede finalizarse esa revisión. Abrir otra requiere nuevas confirmaciones de todos sus seleccionados. Las versiones ya finalizadas no se modifican.
- Advertencias y contradicciones, aun críticas, no impiden confirmar ni finalizar. Los impedimentos técnicos, de seguridad y permisos se distinguen de esos resultados informativos.
- `finalizado` y sello `pendiente` pueden coexistir. Un intento HCS `fallido` se conserva en auditoría, pero la versión sigue finalizada con sello pendiente hasta reconciliación y registro; nunca se regenera el PDF para reintentar.

**No llamar «certificado», «validado regulatoriamente» ni «garantizado verdadero» a un documento producido por el sistema.**

## 6. Invariantes del producto

| ID | Regla no negociable |
| --- | --- |
| INV-01 | Los agentes pueden crear y revisar borradores, pero **no aprobar en nombre del autor** ni publicar por sí mismos en HCS. |
| INV-02 | El Agente 2 informa discrepancias, no habilita ni veta la revisión; resultados críticos y advertencias quedan registrados con fuentes y visibles al confirmar. |
| INV-03 | Solo una versión finalizada tras todas las confirmaciones seleccionadas puede enviarse a HCS; se comprueban permisos, snapshot y hashes persistidos, sin confiar en veredictos del cliente/IA. |
| INV-04 | Hedera y claves de proveedores son accesibles solo a servicios autorizados del servidor; jamás a un agente con herramienta abierta de envío. |
| INV-05 | Versiones finales, PDFs, hashes y los reportes históricos asociados **no se sobrescriben**; cambios → nueva versión con referencia anterior. |
| INV-06 | A HCS solo se envían hashes e identificadores opacos no sensibles; nada de texto privado, nombres, correos ni evidencias. |
| INV-07 | Persistir modelo, momento, versión de reglas, referencias a fuentes y resultado. Re-verificar histórico usa datos guardados, no vuelve a consultar IA para reescribir la historia. |
| INV-08 | Registrar auditoría de acciones críticas de forma solo-agregar; respetar retención y eliminación legalmente necesarias. |
| INV-09 | Conservar separadas **fecha/hora declarada del hecho** y **fecha/hora real de carga del servidor**; cálculos reproducibles contra datos persistidos. |
| INV-10 | Ortografía/formato corregibles; valores materiales no se inventan. Dudas y contradicciones se explicitan sin bloquear ni exigir aclaración. |
| INV-11 | Confirmación del autor autenticado y autorización de propiedad obligatorias; elegir terceros es optativo, pero cada elegido debe confirmar el mismo snapshot antes de finalizar. El token individual nunca autoriza acceso al chat ni evidencias privadas. |
| INV-12 | Cada invitación a corroborar tiene token aleatorio de alta entropía, almacenado mediante hash, caducidad, un solo uso y estado de revocación. |
| INV-13 | Toda respuesta conserva revisión, snapshot completo mostrado, nombre declarado del tercero, estado de casilla, decisión y fecha. Confirmar exige casilla marcada; rechazar exige casilla desmarcada y modal ratificado, no conformidad. GET no consume; respuesta y consumo son atómicos e idempotentes. |
| INV-14 | Selección fija por revisión: solo autor, autor + intermediario, autor + comprador o los tres. Cambio material o de selección requiere nueva revisión y nuevas confirmaciones de todos; rechazo impide finalizar esa revisión. |
| INV-15 | Verificador público e invitación son accesos distintos. El verificador no expone conversación ni archivos privados; con PDF comprueba integridad, nunca verdad factual; sin PDF solo informa estado de registro. |
| INV-16 | Las anomalías temporales, estadísticas y metadatos de edición se exponen como señales de revisión, no como condena automática de fraude. |
| INV-17 | Todos confirman idéntico contenido de operación congelado. Solo después de todas las confirmaciones se añade el anexo de constancias, sin alterar ese contenido, y se genera PDF/manifiesto/hash antes de HCS. Sin HCS adicional por confirmación en P0. |
| INV-18 | Un fallo HCS deja versión finalizada y sello pendiente; reintentos preservan PDF/hash y reconcilian resultados inciertos. Ningún cambio posterior sobrescribe una versión finalizada. |

## 7. ALCOA+ y GAMP 5: controles proporcionados al usuario

**ALCOA+** inspira la atribución, legibilidad, contemporaneidad, originalidad, exactitud, completitud, consistencia, durabilidad y disponibilidad de los registros. El producto aplica controles automáticos sin convertir cada operación sencilla en una auditoría compleja.

| Clase de resultado | Ejemplo | Efecto |
| --- | --- | --- |
| Corrección automática inocua | Tildes, espacios, estructura, errores tipográficos inequívocos | Resolver y dejar visible en la revisión final cuando sea material |
| Sugerencia opcional | «Conviene especificar la condición de pago» | Una advertencia, sin bloqueo |
| Contradicción material | «Mencionaste dos precios diferentes para el mismo producto» | Exponer ambos precios y sus fuentes; no elegir ni bloquear. Aclaración voluntaria del autor |
| Advertencia de integridad | Carga tardía, lote retroactivo de mediciones, valores idénticos repetidos, PDF con metadatos de edición | Registrar y recomendar revisión; no acusar fraude ni bloquear por sí solo |
| Problema de fuente | Foto ilegible o dato afirmado incompatible con la evidencia | No declarar ese dato verificado; advertir la limitación sin retener la revisión |
| Impedimento técnico, seguridad o permisos | No se puede persistir el snapshot o el token no autoriza la acción | Impedir la acción afectada, informar la causa y no fingir éxito |
| Confirmación faltante o rechazo | Falta comprador seleccionado o rechaza | Esperar todas las confirmaciones; si hay rechazo, esa revisión no se finaliza y se permite una nueva |

- Los umbrales temporales dependen del proceso y no se aplican universalmente a operaciones distintas.
- Una confirmación de tercero es una declaración adicional, no una firma digital ni garantía de veracidad. El nombre autodeclarado no es identidad comprobada.
- Un PDF editado no es necesariamente falsificado. Sus metadatos no permiten concluir con seguridad si se manipuló con mala intención.
- **GAMP 5** se utiliza como guía de desarrollo basado en riesgos, trazabilidad y evaluación, **no como reclamo de conformidad o certificación del MVP**.

## 8. Modelo de datos y persistencia con Supabase

- **Usuario** (`auth.users`): sesión real de quien redacta y aprueba.
- **Documento/chat:** unidad lógica privada con propietario.
- **Mensaje/evidencia:** textos y archivos fuente, autor, fecha real de carga, fecha del hecho cuando se declara, ruta privada y hash.
- **Borrador:** contenido estructurado y texto legible que evoluciona dentro del chat.
- **Reporte de verificación:** fuentes, contradicciones, advertencias y modelo utilizado.
- **Revisión:** contenido de operación congelado, advertencias y selección fija de participantes; identidad del snapshot y confirmaciones propias, sin herencia de revisiones previas.
- **Versión:** revisión finalizada tras todas las confirmaciones, anexo de constancias, PDF, manifiesto, hashes y referencia anterior, inmutables aunque HCS siga pendiente.
- **Solicitud de corroboración:** revisión/snapshot exacto, tipo de tercero (comprador/intermediario), hash del token, vencimiento, estado y contenido completo autorizado.
- **Respuesta de corroboración:** nombre autodeclarado, estado de casilla, fecha/hora, confirmación o rechazo ratificado en modal y referencia al snapshot completo mostrado; no firma digital ni identidad verificada.
- **Auditoría:** eventos críticos append-only y registros de HCS.

### Tablas orientativas (migraciones SQL versionadas)

| Tabla | Propósito |
| --- | --- |
| `documents` | Documento lógico, dueño y estado actual |
| `messages` | Conversación, remitente y marcas temporales |
| `evidences` | Evidencia original, hash, ruta privada y metadatos |
| `drafts` | Estado editable, última propuesta y revisiones congeladas con selección y snapshot identificables |
| `verification_reports` | Dictamen del Agente 2, fuentes, advertencias y anomalías |
| `document_versions` | Contenido final y anexo de constancias, PDF/manifiesto inmutables, hashes y revisión con todas sus confirmaciones |
| `corroboration_requests` | Tercero seleccionado, token hash, revisión/snapshot, caducidad y revocación |
| `corroboration_responses` | Confirmación/rechazo, nombre declarado, casilla, ratificación del rechazo, snapshot y fecha |
| `audit_events` | Eventos relevantes solo-agregar |
| `hedera_registrations` | Sello de versión finalizada, intentos y reconciliación; sin registros adicionales por confirmación en P0 |

- RLS en todas las tablas expuestas y reglas específicas para Storage privado; el backend comprueba propiedad y permisos.
- Los terceros **no obtienen sesión de usuario**, ni acceso a evidencias o chats privados. La invitación válida entrega el contenido completo de operación del snapshot, idéntico al del autor y demás seleccionados, no solo un resumen.
- Los tokens no se guardan en claro; se generan con entropía suficiente, pueden revocarse y caducan. Su caducidad exacta es configurable; el intervalo definitivo se define en un ticket técnico.
- Cada respuesta pertenece al snapshot exacto de su revisión. Leer por GET no consume tokens; consumir y persistir la respuesta es atómico e idempotente. Solo con todas las confirmaciones se añade el anexo y se genera la versión final; no se añade una corroboración tardía a un PDF finalizado.
- Supabase Postgres, Auth, Storage y `@supabase/ssr`; sin Better Auth, Prisma, Resend ni almacenamiento paralelo para este alcance.

## 9. Integración Hedera HCS y verificación

- Se usa **Hedera Consensus Service**, no smart contracts ejecutables. Una aplicación Next.js real se conecta a **Hedera Testnet** desde el servidor Node.js con `@hiero-ledger/sdk`.
- **Orden obligatorio:** todas las confirmaciones seleccionadas del mismo snapshot → incorporar constancias como anexo sin cambiar la operación → generar PDF final, manifiesto y hashes → publicar huella en HCS Testnet. Se calcula SHA-256 de los bytes del PDF; el manifiesto canónico versionado relaciona PDF, evidencias, reporte, constancias y versión, y solo su huella se publica en el topic.
- Se persiste identificación de topic, transacción, secuencia, marca temporal de consenso y resultado del envío. Ante fallo la versión permanece **finalizada con sello pendiente**; ante resultado incierto se reconcilia antes de reintentar con el mismo PDF/hash, sin regenerar contenido ni afirmar registro sin evidencia.
- **No hay HCS adicional por confirmación en P0**, ni sellado anterior a las confirmaciones. Un rechazo impide generar la versión final de esa revisión; se puede crear otra con nuevas confirmaciones. Un cambio posterior a una versión finalizada requiere nueva versión y conserva íntegro el PDF histórico.
- El verificador público, distinto del enlace de invitación, toma una referencia opaca y un PDF suministrado por el visitante: comprueba sus bytes contra el hash conservado y el manifiesto contra el mensaje HCS recuperado de un Mirror Node. Sin PDF solo informa el estado del registro, nunca «archivo verificado». No expone archivos, constancias personales, evidencias ni conversaciones privadas.
- Las claves Hedera y de proveedores permanecen en el servidor. Los agentes no reciben herramientas genéricas para escribir en blockchain.
- **Testnet** sirve para el MVP y la hackathon, aclarando que puede resetearse y no ofrece permanencia de producción. **Mainnet** queda para después.

## 10. Experiencia de usuario

**Pantallas del producto:** landing simple; login/registro; panel e historial; chat/documento con adjuntos; vista previa/aprobación; versiones; página pública de verificación; página pública `confirm/[token]` para terceros.

- Interfaz centrada en conversar: sin asistentes de 15 pasos, formularios excesivos ni rondas de aclaración obligatorias. La IA continúa con advertencias explícitas; el autor puede aclarar por chat.
- La IA redacta y revisa; presenta un borrador utilizable con un resumen breve de advertencias y cambios automáticos. El autor puede aprobar o continuar conversando.
- La revisión final distingue «No se encontraron inconsistencias críticas» de «Los hechos fueron corroborados».
- Antes de recoger confirmaciones: «¿Quiénes van a confirmar: solo vos, vos e intermediario, vos y comprador o los tres?». La IA puede sugerir; el autor decide y la selección queda fija por revisión.
- Cada solicitud muestra QR, botón **Copiar enlace**, opción **Compartir por WhatsApp** (URL prearmada sin backend) y **Enviar por correo** (`mailto:` del dispositivo). No se promete envío automático.
- Autor y terceros ven idéntico documento completo de operación congelado con sus advertencias, no solo resumen; no se muestran chat ni evidencias privadas a terceros. Cada tercero escribe nombre y apellido autodeclarados, sin login.
- Checkbox inicialmente vacío: marcado habilita **Confirmar**; desmarcado permite **No coincide / Rechazar**, acción secundaria pero visible, accesible y sin dificultad deliberada. El rechazo abre un modal para ratificar o cancelar; cancelar no registra respuesta ni consume el token. No se exige marcar conformidad para rechazar.
- Abrir la invitación no consume el token. Enlace vencido, revocado o de revisión sustituida no acepta respuestas; un token consumido no permite otra decisión, pero el reintento de la misma respuesta devuelve el resultado ya persistido sin duplicarlo.
- Mostrar por separado avance de confirmaciones, finalización y HCS. Se puede seguir conversando mientras faltan respuestas, pero no finalizar esa revisión; un cambio material abre otra y exige confirmar de nuevo. Rechazo impide finalizar la revisión afectada y permite una nueva.
- Tras todas las confirmaciones se añaden constancias sin modificar la operación, se genera el PDF final y se registra HCS. Si falla HCS, mostrar «Versión finalizada; sello pendiente», no «sellada»; reintentar sin cambiar PDF/hash.
- La página pública de verificación no sirve para confirmar. Sin aportar PDF muestra solo estado del registro; al aportarlo informa integridad comprobada, discrepancia o imposibilidad de verificar según el resultado real.
- Al actualizar por el mismo chat, una devolución o anexo posterior crea una nueva versión; no reemplaza retroactivamente el relato de una entrega pasada.

## 11. Seguridad, privacidad y limitaciones de confianza

- **Supabase Auth** para autor y usuarios registrados. Supabase gestiona sus correos de autenticación durante el MVP, con sus límites; **no hay Resend**.
- **Next.js 16 + `@supabase/ssr`** para sesiones mediante cookies, con verificación de autorización y RLS en acceso a tablas y buckets.
- Evidencias, PDFs privados, chats e identidades de usuarios no se incluyen en HCS.
- El tercero accede mediante un token de alta entropía, guardado en base solo como hash, con caducidad, un solo uso y revocación. La página revela el documento de operación completo del snapshot autorizado, no chat ni evidencias privadas. GET no consume; consumo y respuesta se persisten atómicamente, de forma idempotente ante doble clic y reintento.
- Un nombre escrito por quien abre un enlace compartible **no verifica que esa persona sea el comprador/intermediario real**. Mostrar «Confirmado mediante enlace» y guardar el contexto, **no** «identidad certificada» ni «firma digital».
- Para evidencias sensibles o acuerdos de riesgo elevado serán necesarios métodos de identificación adicionales, revisión jurídica y reglas específicas posteriores.
- Archivos y datos reales regulados no se usan en servicios gratuitos sin revisar antes términos, retención, privacidad y permisos de cada proveedor. Para el Ideatón, datos ficticios.
- No inventar consenso, identidad o integridad cuando falla IA, Storage o HCS. Evitar URLs permanentes públicas de archivos privados.

## 12. Pruebas y métricas

**Pruebas deterministas, en cada PR que afecte la funcionalidad:**

1. Un usuario A no ve documentos, archivos ni respuestas privadas de B.
2. La conversación y sus evidencias persisten entre sesiones; una modificación genera v2 sin alterar v1.
3. Confirmar como autor requiere sesión y propiedad; una revisión sin todas las confirmaciones seleccionadas no genera PDF final ni pasa a HCS. Solo autor seleccionado basta con su confirmación final.
4. Omisiones, dudas y contradicciones críticas de precios o cantidades producen advertencias materiales explícitas sin bloquear ni inventar datos. Impedimentos técnicos, seguridad y permisos sí impiden la acción afectada y no producen éxito ficticio.
5. El código que calcula estados da el mismo resultado para los mismos eventos; los tests mockean ambos agentes.
6. Fallo HCS conserva versión finalizada y sello pendiente, con PDF/hash idénticos. Resultado incierto se reconcilia antes de reintentar; no se afirma registro sin comprobarlo.
7. Modificar un byte del PDF cargado provoca un fallo de integridad.
8. La invitación pertenece a revisión/snapshot/tercero, vence y puede revocarse; GET no la consume. Respuesta y consumo atómicos: doble clic/reintento devuelve una única respuesta persistida, nunca dos decisiones.
9. Probar las cuatro selecciones: siempre autor y un enlace distinto por tercero elegido. Todos reciben idéntico documento de operación completo con advertencias; ningún tercero obtiene chat ni evidencias privadas.
10. El usuario que declara una devolución posterior conserva intacta la versión de entrega anterior.
11. Cambiar materialmente el snapshot o los participantes crea una revisión sin confirmaciones heredadas y sustituye enlaces pendientes. Toda versión finalizada permanece inmutable; cambios posteriores crean otra versión.
12. Checkbox vacío no permite confirmar; marcado sí. Rechazar con checkbox desmarcado exige modal ratificado; cancelarlo no responde ni consume token. Acción de rechazo visible y accesible; rechazo impide finalizar esa revisión, pero permite otra.
13. Ningún PDF final ni mensaje HCS se produce antes de todas las confirmaciones. Después se agrega el anexo sin cambiar el contenido acordado, se genera PDF/manifiesto/hashes y se registra HCS, sin mensajes adicionales por confirmación en P0.
14. Verificador e invitación son distintos. Con PDF verifica sus bytes; sin PDF solo muestra estado del registro y no afirma integridad del archivo. Ningún acceso público de verificación filtra chat, evidencias ni constancias personales.
15. Entrega con cantidades contradictorias y medición sin unidad siguen disponibles para confirmar, con fuentes/discrepancias explícitas y sin datos inventados; no se proclama validación visual independiente.

**Evaluación de IA separada de tests de CI:**

- Dataset de partida recomendado: **30 casos** (p. ej., 15 correctos y 15 con contradicciones, omisiones o errores sembrados), con etiquetas preparadas antes de ejecutar los modelos.
- Medir errores detectados / errores etiquetados, falsos positivos y omisiones. Registrar versiones de modelos y prompts; repetir ejecuciones cuando importe medir variación.
- No convertir respuestas estocásticas de la IA en tests unitarios frágiles ni hacer fallar cada PR por una salida diferente del proveedor.
- No comunicar resultados hipotéticos como si fueran una evaluación real. Estas pruebas no demuestran detección de fraude ni validación regulatoria.

## 13. Colaboración del equipo (sin orden predeterminado)

**Un solo repositorio** y una aplicación real. El PRD define producto, stack, límites y calidad; **no determina un cronograma, orden de tickets, sprints ni responsables nominales inamovibles**.

- El equipo convierte requisitos en **Issues independientes**, con objetivo, criterios de aceptación, carpetas autorizadas, contratos TypeScript y mocks.
- Cada integrante usa su propio agente de codificación en una **rama corta por ticket**; puede trabajar en paralelo con otros cuando no se pisan archivos ni contratos.
- Cada entrega se presenta en **Pull Request**, con descripción, captura/video cuando corresponda, y checks de tipos, lint, build y pruebas relevantes.
- **El líder técnico revisa y realiza los merges**; también integra, resuelve conflictos y valida/corrige el producto final.
- Configuración global, Supabase Auth/RLS, claves, migraciones, API y Hedera se coordinan con el líder; ninguna IA modifica esas zonas por iniciativa propia fuera del ticket asignado.
- Se permite que alguien distinto del líder implemente una integración si existe **ticket explícito y supervisión**; no se bloquea artificialmente el aporte de los cuatro colaboradores.

### Estructura orientativa del repositorio (App Router, conservando `src/` actual)

```text
src/
  app/
    (marketing)/
    (auth)/
    (app)/dashboard/
    (app)/documents/[id]/
    verify/[reference]/
    confirm/[token]/             # Invitación pública, distinta del verificador
    api/                         # Rutas del backend
  features/
    dashboard/
    chat/
    documents/
    corroborations/
  components/ui/
  hooks/
  lib/
    supabase/
    ai/                          # Orquestación de Gemini + Groq
    hedera/
    documents/                   # PDF, versiones, hashes
    rules/
    contracts/                   # Contratos compartidos
  mocks/
supabase/migrations/
tests/
AGENTS.md
package.json
package-lock.json
```

### Dependencias principales (npm)

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install ai @ai-sdk/google @ai-sdk/react groq-sdk zod
npm install @hiero-ledger/sdk @react-pdf/renderer
```

### Variables de entorno orientativas

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=
HEDERA_PRIVATE_KEY=
HEDERA_TOPIC_ID=
```

Solo las dos variables `NEXT_PUBLIC_` se exponen en cliente. El nombre exacto de configuración de proveedores se verifica en la implementación. El `package-lock.json` se comitea; no se incorporan Redis, colas, microservicios, servicios de email externos ni pagos en P0.

## 14. Gestión de tickets (sin plan técnico impuesto)

Este PRD **no establece secuencias obligatorias** de tareas. Se mantienen como referencia para evaluar tickets: requisitos P0, reglas del producto, contratos entre frontend/backend, restricciones de seguridad, pruebas y aceptación.

Los integrantes pueden ejecutar Issues en paralelo y sus agentes deben ceñirse a las carpetas y contratos de cada tarea. **La definición y orden de los tickets se deciden por el equipo según disponibilidad, dependencias reales y avance**, no por este documento. El líder técnico integra los PR y valida el funcionamiento conjunto.

## 15. Evolución posterior (no condiciona el MVP)

- Audio y transcripción, lectura más robusta de documentos complejos y herramientas adicionales de extracción.
- Verificación de identidad de terceros más fuerte, OTP y envío **automático** de invitaciones por correo/WhatsApp (si se considera necesario y se contrata el servicio).
- Mercado Pago Subscriptions y, opcionalmente, Stripe.
- Multiempresa, equipos/roles, reglas por sector, paneles y analíticas.
- Pilotos con empresas reales, revisión jurídica, requisitos regulatorios y eventual trabajo formal de validación GAMP 5.
- Hedera Mainnet cuando corresponda.

**El flujo básico de corroboración mediante enlace/QR y compartición manual ya está en el MVP**; no se posterga aquí.

## 16. Registro de decisiones y detalles abiertos

### Decisiones cerradas

- **D-01:** una única aplicación real Next.js 16 + TypeScript, sin prototipo descartable.
- **D-02:** Supabase Auth/PostgreSQL/Storage; sin Better Auth, Prisma, R2 ni Resend en MVP.
- **D-03:** cada chat es un documento lógico persistente con versiones inmutables.
- **D-04:** autonomía máxima: dudas, omisiones y contradicciones se advierten explícitamente, no bloquean ni obligan a aclarar; no inventar datos. Criterios iniciales de entrega y medición orientativos, sin esquemas rígidos.
- **D-05:** Agente 1 con **Gemini 3.5 Flash-Lite mediante Vercel AI SDK**; Agente 2 con **GPT-OSS 120B en Groq mediante `groq-sdk`**.
- **D-06:** la IA compara y advierte, nunca veta por contenido; solo impedimentos técnicos, seguridad, permisos o confirmaciones faltantes detienen la etapa. El autor confirma siempre; un rechazo impide finalizar esa revisión y permite otra.
- **D-07:** Hedera **HCS** (no smart contracts), Testnet para el MVP; PDF y manifest hash verificables.
- **D-08:** selección optativa fija por revisión: solo autor, autor + intermediario, autor + comprador o los tres; confirmación obligatoria de cada elegido. Un enlace/QR individual por tercero, compartición manual por WhatsApp/email o presencial.
- **D-09:** terceros sin cuenta, nombre autodeclarado; confirmar con checkbox marcado, rechazar desmarcado con modal. Rechazo secundario visible/accesible; no firma digital ni identidad verificada. GET no consume, respuesta/consumo atómicos e idempotentes.
- **D-10:** observaciones de anomalías no significan falsedad ni bloqueo automático.
- **D-11:** evaluación de IA y tests deterministas separados; métricas reportadas honestamente.
- **D-12:** desarrollo mediante Issues, ramas por ticket, PR y merge/validación por responsable técnico; **el PRD no fija orden ni cronograma de trabajo**.
- **D-13:** pagos reales y funcionalidades regulatorias complejas fuera del alcance inicial.
- **D-14:** idéntico contenido de operación completo y congelado para todos, sin chat/evidencias privadas; cambio material o de selección crea nueva revisión y exige todas las confirmaciones de nuevo.
- **D-15:** todas las confirmaciones → anexo de constancias sin alterar operación → PDF final/manifiesto/hashes → HCS Testnet. Versiones finalizadas inmutables; sin HCS adicional por confirmación en P0. Fallo HCS deja sello pendiente y se reconcilia/reintenta con mismo PDF/hash.
- **D-16:** verificador público distinto de invitación; con PDF verifica integridad, sin PDF solo informa estado del registro; no publica chat, evidencias ni datos privados.
- **D-17:** conservar `src/` actual; el árbol es orientativo, no una instrucción para mover código.

### Detalles de implementación pendientes (no reabren las decisiones)

- Esquemas Zod finales y ajustes de criterios documentales por contexto, sin convertir dudas o datos materiales ausentes en bloqueos por contenido.
- Límites de adjuntos, pipeline de extracción multimodal y tratamiento de discrepancias visuales no verificadas por GPT-OSS.
- Vigencia exacta de tokens, prevención de abuso/rate limit y posibilidad de reemisión segura.
- Canonicalización del manifiesto con constancias y detalles de reconciliación HCS ante errores, preservando el mismo PDF/hash; sin registros adicionales por confirmación en P0.
- Parámetros de modelos, configuración de coste, tiempos máximos y calidad mínima antes de habilitar documentos reales.
- Revisión jurídica de lenguaje de confirmación electrónica y política de privacidad para uso comercial real.

## 17. Glosario

- **ALCOA+:** criterios de integridad de datos: atribuible, legible, contemporáneo, original y exacto, más completo, consistente, duradero y disponible.
- **GAMP 5:** guía para el desarrollo y validación de sistemas informatizados basado en riesgos; no equivale a una certificación automática.
- **Evidencia:** fuente aportada por una persona o sistema que respalda una afirmación.
- **Manifiesto:** estructura que vincula hashes del PDF final y sus constancias, datos de versión, referencias de evidencias y resultado de controles; solo su huella se publica en HCS.
- **HCS:** Hedera Consensus Service, servicio para ordenar y fechar mensajes mediante consenso.
- **Huella:** resultado criptográfico calculado a partir de contenido; no acredita su veracidad.
- **Versión:** snapshot finalizado, inmutable y vinculado con su antecedente.
- **Revisión:** contenido de operación congelado y selección fija de participantes, identificados exactamente para sus confirmaciones. Un cambio material o de selección exige otra revisión sin heredar confirmaciones.
- **Advertencia material:** omisión, duda o contradicción relevante para interpretar la operación; visible para todos al confirmar, sin impedir finalizar ni suplir datos.
- **Impedimento:** condición técnica, de seguridad, permisos o falta de confirmaciones que impide una etapa; no es un juicio de IA sobre la operación. Rechazo impide finalizar esa revisión.
- **Corroboración por enlace:** declaración electrónica de una contraparte sobre el mismo snapshot completo mediante enlace individual; elegirla es optativo, obtenerla es obligatorio si se eligió. No implica identidad certificada ni firma digital.
- **Constancia:** registro de confirmación anexado después de todas las confirmaciones, sin modificar el contenido de operación acordado.
- **Sello pendiente:** versión finalizada con PDF/hash inmutables cuyo registro HCS aún no se ha comprobado; un fallo o resultado incierto no equivale a sello registrado.

## 18. Referencias oficiales del stack

- Supabase SSR con Next.js: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase Auth y email integrado (límites): https://supabase.com/docs/guides/auth/auth-smtp
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- AI SDK: https://ai-sdk.dev/docs/introduction
- Gemini 3.5 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- Groq GPT-OSS 120B: https://console.groq.com/docs/model/openai/gpt-oss-120b
- Groq SDK: https://console.groq.com/docs/libraries
- SDK JS de Hiero/Hedera: https://github.com/hiero-ledger/hiero-sdk-js
- Hedera Consensus Service: https://docs.hedera.com/hedera/core-concepts/consensus-service
- Next.js App Router: https://nextjs.org/docs/app

**Nota de alcance:** estas referencias guían la implementación. Ninguna librería o servicio por sí solo demuestra cumplimiento de ALCOA+ o validación GAMP 5.

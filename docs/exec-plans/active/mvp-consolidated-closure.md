# Consolidación y cierre integrado del MVP

## Objetivo y alcance

Llevar el P0 desde módulos integrados hasta una aplicación desplegada que Nahuel pueda validar personalmente con datos ficticios. Este plan coordina los planes por ID del [maestro](mvp-master-plan.md); no reemplaza el [PRD](../GALCOA-PRD-v1.4.md), contratos ni sus aceptaciones. No acredita uso comercial con datos reales ni dictamen jurídico.

El usuario confirmó que trabaja solo. Nahuel es el único ejecutor y dueño de integración; no se asignan tareas nuevas a Facu/Gastón. Se conserva su trabajo, se comprueba actividad remota antes de cada entrega y se incorporan aportes pendientes mediante revisión. Las asignaciones históricas de los planes no representan el reparto vigente. Este documento sucede a la secuencia operativa del [rollout anterior](nahuel-multiissue-rollout.md), que conserva el historial de permisos.

## Base y evidencia de la auditoría

- Snapshot: `1afd147860c8640df7ced9288245f8dec759d2b1` de `origin/develop`, merge de PR #90. Ocho investigaciones/revisiones sobre entregas, Auth, persistencia/ejecutor, evidencias, IA/chat, confirmaciones, finalización/sello/verificador y frontend/CI/release.
- Sin implementación ni operaciones cloud durante esta etapa. Los informes son principalmente estáticos: sus referencias a tests pasados no son una nueva ejecución. Un revisor reportó typecheck y tests; no se usan como validación conjunta del snapshot ni como evidencia de copia íntegramente inalterada.
- GitHub consultado: sin PR abiertos; CI de develop run `38970710743` exitoso. `main` estaba 162 commits detrás. Revalidar ambas cosas al ejecutar.
- Rama remota `issue/21-revision-compartir`, HEAD observado `9f16601`: cuatro commits no integrados. Revisar y reutilizar; merge limpio no implica aceptación funcional.
- Maestro: conteo observado de filas 28 completadas, 29 en curso y 16 pendientes (73); resumen desactualizado. PR #88/#89 tienen integración parcial no reflejada en MVP-116/118. No cerrar por mera presencia de código.
- PR #86 evidencias y PR #87/#90 confirmaciones recibieron revisión independiente estática con hallazgos. No equivalen a seguridad transversal aprobada ni a pruebas de concurrencia con finalización.

## Decisiones y límites

- Reutilizar servicios existentes; agregar adaptadores, RPC, composición y UI faltantes. No crear versiones alternativas ni un nuevo pipeline documental por módulo.
- Una cola de ejecución. Paralelismo auxiliar solo si aporta valor y no hay escritores de archivos o base compartidos. Todos los `fix-agent`, si se usan, exclusivamente `openai/gpt-6.1-sol#low`.
- Actualización posterior del usuario: los próximos fix-agent usarían Sonnet 5.5 normal en lugar de la selección anterior. Luego indicó permisos con `subagent: deny`: mientras rija esa restricción, la implementación y validación se realizan directamente, sin nuevas delegaciones. La autorrevisión no se presenta como revisión independiente.
- Posteriormente pidió explícitamente retomar delegación a implementers; la herramienta aceptó las nuevas sesiones. Se retomaron tareas disjuntas de QR/navegación y accesibilidad, sin reinterpretar una futura denegación como permiso para eludirla. Para fix-agent sigue vigente Sonnet 5.5 normal.
- No leer archivos de entorno/secretos ni publicarlos. TLS estricto; sin desactivar validación de certificados, permisos generales o acceso administrador como solución rápida.
- Usuario reportó contraseña y `GALCOA_EXECUTOR_DATABASE_URL` configuradas en Vercel: **configuración informada, conectividad sin verificar**. No inferir PASSWORD NULL actual desde la migración inicial. Vercel existente: `https://galcoa-nea.vercel.app`.
- Último estado remoto documentado: seis migraciones aplicadas; no verificado de nuevo. Las tres adicionales del snapshot (001200, 001201 y 002000) requieren comparar catálogo/historial antes de declarar ausencia o aplicar. No interpretar este plan como permiso nuevo para ampliar el alcance remoto del rollout.
- Gemini `gemini-3.5-flash-lite` y Groq `openai/gpt-oss-120b`, capas gratuitas; sin fallback pago. Disponibilidad/cuotas se verifican en la sesión real final, no se deducen de conocimiento antiguo ni de tests doblados.
- Hedera solo Testnet. Topic pendiente de decisión/confirmación, no demostrado inexistente. Creación y transacciones reales requieren autorización específica pendiente. Ninguna herramienta de envío blockchain se entrega a agentes de producto.
- Sin SMTP nuevo. Cuentas ficticias preparadas; registro y recuperación completos se prueban con Mailpit local. URLs de Auth remotas se ajustan al desplegar, según acuerdo previo.
- Release `develop` → `main` por PR ya autorizado después de pruebas y revisión de seguridad. Nunca push directo. Una cuota de previews se informa, no se disfraza como defecto funcional ni autoriza pagar.

## Secuencia de ejecución

### A. Recuperación y correcciones de base

- [ ] Revisar rama #21: contratos, dependencias/QR, red real, privacidad y tests; publicar PR e integrar lo aceptado sin duplicar el trabajo de Facu. No agregar dependencia de QR sin resolver explícitamente su necesidad y autorización.
- [ ] Confirmar hallazgos de auditoría mediante casos focales antes de corregir: discordancia documento/revisión en confirmación del autor; error de idempotencia de auditoría; pérdida de advertencias de redacción/reglas al congelar.
- [ ] Diseñar y probar limpieza de reservas/objetos abandonados, incluidos clientes que jamás llaman complete. Proteger aceptación concurrente: no borrar originales aceptados ni liberar cuota física sin controlar el objeto remanente. No basta borrar ante cualquier retorno null. Evitar infraestructura nueva por defecto.
- [ ] Diferenciar expiración solo después de autorización, sin filtrar existencia de recursos ajenos. Revisar compatibilidad MIME sin reemplazar inspección de bytes del servidor.
- [ ] Incluir suite de persistencia de evidencias y E2E real de confirmaciones en CI serial. Corregir expectativa obsoleta de ocho migraciones con verificación de versiones esperadas, no simplemente otro contador frágil. Conservar fallos de prerrequisitos y privacidad de logs.
- [ ] Ajustes locales de navegación y accesibilidad: destino tras login, idioma/metadatos, fuente circular y encabezados. No inventar requisitos como título editable si el PRD no los exige. No cambiar límites Unicode ni política de password/recovery por recomendaciones no verificadas.

Aceptación: PRs acotados, regresiones focales y CI pertinente; sin marcar F7 completo mientras falte la carrera con F8.

### B. Chat, IA, advertencias y revisión utilizables

IDs: MVP-040…044, 051…054, 061/062, 077/078, 116. Referencias: planes F4/F5/F6/F7/F11 enlazados desde el maestro.

- [ ] Migraciones aditivas y adaptadores para TurnStore, DraftStore y ContrastStore usando las tablas ya existentes cuando correspondan; claims, fencing/idempotencia y auditoría con actor de sesión. No permitir al autor falsificar resultados del agente.
- [ ] Componer handlers de turno NDJSON y contraste con servicios existentes. Definir rutas reales desde los contratos verificados; los paths sugeridos por informes no son API aprobada.
- [ ] Consolidar advertencias de Agente 1, Agente 2 y reglas con fuentes, revisión vigente y alias; asegurar que el snapshot no pierda advertencias materiales. Advertencias incluso críticas nunca vetan.
- [ ] Container y montaje: historial real de mensajes, streaming, cancelación, reintento sin duplicar, reserva/subida/aceptación/extracción y contraste. Un error no se muestra como éxito ni deja respuesta parcial oficial.
- [ ] Conectar revisión/snapshot y compartir manual recuperados de #21; navegación desde documento con estados separados de confirmaciones, finalización y sello.

Aceptación: crear/reabrir documento → conversar/adjuntar → borrador/contraste persistidos → revisión y respuestas sobre el mismo snapshot. Supabase local real, proveedores doblados, cuatro selecciones y pruebas de cancelación/concurrencia. No acreditar IA real aún.

### C. Finalización durable y versiones

IDs: MVP-070…076 (cierre de integración), 080…084.

- [ ] Claim atómico bajo locks con confirmaciones completas y mismo snapshot, lease/fencing y reserva durable de identidad/nonce/fecha. Probar carrera freeze/claim; nueva revisión no sustituye un claim vigente.
- [ ] Reutilizar renderer, constancias y manifiesto. Guardar bytes/hashes canónicos en staging; reanudar desde checkpoints sin regenerar artefactos comprometidos ni alterar fecha reservada.
- [ ] Storage privado sin overwrite, comprobación del objeto y publicación transaccional; fallo de Storage no marca finalizado. Historial y descarga autorizados reales.
- [ ] v2 en el mismo documento sin cambiar v1 ni heredar confirmaciones. Habilitar explícitamente el ciclo posterior a finalizado mediante migración aditiva.
- [ ] Mantener la distinción envelope canónico (`galcoa.manifest.v1`, `reference`) / DTO público (`schemaVersion: 1`, `publicReference`). Nunca recalcular el hash desde la proyección visual.

Aceptación: concurrencia con dos o más conexiones, rechazo/confirmación faltante impiden finalizar, advertencia crítica no bloquea; recuperación de fallos y PDF/hash/versiones inmutables.

### D. Sello y verificador

IDs: MVP-090…093, 100/101.

- [ ] Persistir intención y bytes preparados antes del envío; orquestar cliente existente y guardar resultados comprobados. Un timeout es incierto, no éxito ni permiso para duplicar envío.
- [ ] Reconciliar con Mirror antes de reintentar, conservando PDF/hash. No introducir colas, cron o servicio nuevo por asumirlos necesarios.
- [ ] Proyección pública mínima mediante RPC restringida, adaptador, endpoint y página de verificación. Nunca exponer chat, originales, constancias privadas ni claves.
- [ ] Validar carga acotada de PDF compatible con límite del hosting; no diseñar un POST de 10 MiB por Next/Vercel que exceda su límite. Evaluar hash local o transporte permitido preservando el contrato de integridad y privacidad.

Aceptación local: transportes HCS/Mirror doblados, alteración de un byte, no verificable ante indisponibilidad y resultado incierto reconciliado; sin transacciones reales en desarrollo.

### E. Validación integral y seguridad

IDs: MVP-118, 121, 123, 130.

- [ ] Enlazar los 15 casos PRD y cuatro selecciones con evidencia explícita, distinguiendo navegador, factories/RPC y transporte Next real. No marcar caso cubierto por un mock visual.
- [ ] Revisión de autorización entre usuarios, RPC públicas directas, logs sin tokens/contenido privado, límites de carga/abuso, CSRF y secretos en bundle. Evaluar validación de booleanos de decisión en RPC sin afirmar que demuestra interacción humana.
- [ ] Revisar rate limiter y confianza en headers del hosting; no optimizar DELETE o agregar mantenimiento externo sin evidencia proporcional.
- [ ] Navegador móvil/escritorio y teclado sobre páginas reales autenticadas y públicas, sin skips que oculten aceptación pendiente.
- [ ] Habilitar runner de evaluación aislado con límites server-only conservados, sin llamadas reales en CI.

Aceptación: regresiones relevantes aprobadas, revisión independiente de cambios sensibles y hallazgos de seguridad bloqueantes resueltos; inventario honesto de limitaciones.

### F. Preparación remota, release y validación personal

IDs: MVP-026, 132…136.

- [ ] Confirmar alcance remoto autorizado; consultar catálogo/historial, aplicar solo migraciones revisadas pendientes sin reset/borrados y verificar equivalencia/versiones.
- [ ] Comprobar conexión limitada/pooler/TLS sin exponer credenciales; no pedir volver a provisionar contraseña por documentación histórica. Verificar variables por presencia/comportamiento, no leyendo valores.
- [ ] Ajustar Site URL/callback/origen canónico a `galcoa-nea`; preparar cuentas y datos ficticios. Confirmar decisión de topic y permiso de prueba Testnet antes de enviar.
- [ ] PR release develop → main tras E; comprobar despliegue y dominio efectivo. Registrar fallos de cuota sin desactivar controles ni pagar automáticamente.
- [ ] Única sesión real final autorizada de IA gratuita y Testnet una vez resueltos permisos específicos; medir evaluación y publicar límites, sin resultados inventados.
- [ ] Entregar URL, acceso por canal privado y guion corto a Nahuel: crear → adjuntar → revisar → confirmar/rechazar → PDF → verificar → v2. Corregir resultados de su validación.
- [ ] Reconciliar REQ-01…18, maestro, Issues y deuda; archivar planes solo con aceptación y evidencia. Jurídica externa permanece abierta si no hay dictamen; no impide demo ficticia.

## Validación y registro

Seguir [desarrollo](../../development.md) y los planes consumidores. Usar checks proporcionales (lint, typecheck, unitarios, barreras, build y navegador según impacto), más integración SQL/Storage real cuando cambie persistencia. Reservar y serializar Supabase local, ocultar salida de claves efímeras y detener solo procesos propios. No tocar contenedores de otros proyectos.

Por entrega registrar commit/PR, comandos y resultados actuales, tipo de doble/proveedor real, aceptación cumplida y huecos. Los ocho informes no autorizan cerrar Issues por código aparentemente completo. No asumir que todo SQLSTATE 23505 es conflicto de idempotencia ni relajar la URL/TLS para resolver configuración.

## Progreso y próximos pasos

El usuario aprobó ejecutar automáticamente las seis etapas, incluyendo implementación, validación y entrega Git. Se detiene solo la parte afectada por riesgos de secretos, permisos, pérdida de datos, finalización sin confirmaciones, cambios destructivos, costos/servicios nuevos, cambios de producto o permisos externos pendientes. Los bloqueos no impiden continuar trabajo independiente seguro. Esta aprobación no resuelve por sí sola la decisión del topic ni autoriza transacciones Hedera pendientes.

- [x] Ocho informes recibidos y contrastadas sus contradicciones principales.
- [x] Cola única, límites externos y criterios de aceptación registrados.
- [ ] A en ejecución tras aprobación expresa: recuperación de #21 y ampliación de cobertura CI; todavía sin cambios remotos de base ni release.
- [ ] Completar B → C → D → E → F, actualizando el progreso con evidencia real.

No se han aplicado migraciones, cambiado código de producto ni desplegado durante la consolidación. No se ha revalidado el estado cloud ni ejecutado un recorrido completo.

## Checkpoint de integración posterior

PR #91 integrado (plan), #92 integrado (CI incluye evidencias y confirmaciones), #94/#93 integrados (presentación y container de revisión, aceptación parcial) y #95 integrado por el usuario (confirmación SQL ligada al documento de la ruta). Las revisiones independientes aprobaron estos cambios; los runs Linux de #92, #94/#93 y #95 terminaron correctamente. No se cierran #21, F7 ni el MVP por estos checkpoints. Persisten QR, navegación, re-congelado, E2E del autor y carrera con finalización.

### Retención de evidencias: entrega escalonada

El diseño de descarte es: claim irreversible en SQL bajo lock → eliminación por API de Storage → liberación de reserva/cupo confirmada. Una aceptada jamás recibe claim, y una reclamada jamás puede aceptarse. Una respuesta `null` de aceptación no otorga autoridad para borrar. La autorización final de INSERT de Storage debe coordinarse con el mismo lock; se necesitan pruebas reales de upload en vuelo, no inferencias desde mocks. Sin actividad futura no se garantiza limpieza con plazo: los residuos deben quedar contabilizados y recuperables, sin cron ni servicios nuevos.

Primer incremento acotado: dejar de liberar cuota automáticamente al vencer una reserva retenida. Contar todas las filas del documento bajo el lock existente, sin cambiar topes (3 archivos / 20 MiB declarados) ni el TTL de 120 s. Esto limita la repetición de abandonos por documento, pero **no** resuelve todavía el borrado seguro ni impone una cuota física global. Una reserva vencida conserva cupo hasta descartarse: la recuperación automática vendrá con el protocolo de claim y su prueba concurrente. No introducir borrado oportunista inseguro para ocultar el estado parcial.

Implementación local de ese primer incremento: migración aditiva `20261016002200_evidence_retained_quota.sql`, sin editar las ya aplicadas. Nuevas regresiones SQL para retención de plazas/bytes, replay vencido y descarte; catálogo incorpora la versión. Typecheck, ESLint focal, 69 barreras y suite por defecto 1099/1099 aprobados. Las regresiones SQL no forman parte de esa suite: pendientes de CI Linux con base real antes de aceptar la migración. Sin llamadas remotas ni borrado de objetos. Autorrevisión explícita, no revisión independiente (subagentes deshabilitados).

Actualización: PR #96 integrado tras run Linux `38989208876` SUCCESS (`validate` 3m40s, `local-server-db` 5m39s); sus regresiones SQL sí quedaron ejecutadas en el runner aislado. No acredita la siguiente migración.

Segundo incremento en desarrollo: `20261016002300_evidence_discard_protocol.sql`. Claim terminal privado, aceptación y subida prohibidas después del claim, finalización del descarte separada de Storage y lote máximo de tres reservas propias antes de reservar. Lock asesor por actor en reserva/claim/descarte, luego lock del documento; autorización de INSERT usa lock del documento y reloj posterior a su espera. La RPC de reserva vuelve a comprobar pendientes para no confiar en un barrido previo no atómico. El clock de Node no decide la expiración. Cuota retenida si falla el borrado, sin liberar por timeout. Falta validar integración real de esta entrega; no se presenta como solución terminada al upload lento/in-flight ni como limpieza de plazo garantizado.

Validación local del segundo incremento: 1103 tests de la suite por defecto aprobados; lint y typecheck correctos. Barreras: primera corrida 68/69 con timeout de ESLint durante carga concurrente; repetición con el mismo comando y timeout original aprobó 69/69. Sin ocultar el fallo ni cambiar configuración de tests. Las pruebas SQL/Storage nuevas incluyen ambos órdenes claim/aceptación, concurrencia, espera de lock con expiración posterior y cuerpo HTTP pendiente; aún no ejecutadas contra base real. El test HTTP no acredita por sí solo el momento del preflight ni eliminación física inmediata del backend de Storage.

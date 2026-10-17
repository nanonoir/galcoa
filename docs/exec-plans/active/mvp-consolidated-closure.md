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

# Ejecución coordinada de Issues de Nahuel

## Objetivo y autorización

El usuario autorizó ejecutar las tandas desde esta sesión, con worktrees separados, subagentes Sonnet disponibles, validación, PR y merge a `develop`, continuando automáticamente con las tareas habilitadas. No se duplica trabajo de Gastón/Facu ni se declara completada una entrega parcial.

## Secuencia

- [x] Tanda 0, parte ejecutable: #3 acceso cerrado (PR #64); preparación de #4 integrada (PR #65) y preparación de #7 integrada (PR #63). Dictamen y confirmación del objetivo remoto pendientes; no se declaran completadas #4/#7.
- [ ] Tanda 1 (parcial integrada): #9 Auth entregada por PR #70 (MVP-031 completada; cierre operativo de #9 tras merge documental). #16 chat y #32 harness con checkpoints parciales integrados por PR #69 y #68 respectivamente; no se declaran completos.
- [ ] Confirmaciones: #18 → #19 → #20 delegadas expresamente a Gastón por el usuario; esta sesión no las implementa. Consumir sus entregas integradas para #21 y avances disjuntos de #31/#32.
- [ ] Verificador #25 y composición #31, si no están ya tomados por otro ejecutor.
- [ ] Validación #33 y seguridad/CI #35 sobre una referencia estable.
- [ ] Despliegue/demo #36 y validación final #37, respetando permisos externos específicos.

## Coordinación

Un worktree y dueño por Issue; hasta tres flujos propios solo con archivos disjuntos y sin interferir con los compañeros. Configuración, dependencias, migraciones, contadores y merges tienen un único coordinador. Cada flujo sigue su ExecPlan existente; este documento solo coordina entregas. Antes de cada tanda se consultan PRs y estados actuales. Los agentes entregan commits/PR sin merge automático; el coordinador revisa e integra de a uno.

## Límites externos

#4 requiere dictamen humano y no se cierra con material preparatorio. #7 requiere identificar inequívocamente el proyecto y autorizar su alcance remoto antes de migrar; no crear ni cobrar servicios ni ejecutar cambios destructivos. No se leen archivos privados de entorno. IA/Hedera reales se reservan para la única sesión final autorizada. Un bloqueo externo pausa solo sus consumidores; no impide avanzar tareas independientes. Los MD temporales y el stash alternativo de #17 se preservan.

## Validación y cierre

Cada entrega registra checks reales, alcance parcial/completo y límites; revisión independiente en cambios sensibles. No se mergean fallos de secretos, permisos, pérdida de datos o finalización sin confirmaciones. Archivar este plan solo al reconciliar todas las entregas o al registrar explícitamente los bloqueos que requieren intervención humana.

## Evidencia inicial

2026-10-16: GitHub confirma `push` para `grancobud` y `jfacundoayala`. Hay PRs abiertos de Facu #59/#60/#61; no tocarlos. `origin/develop` observado en `f178f3e`. Los planes de cada Issue conservan los requisitos de aceptación.

## Tanda 1 en ejecución

Tres worktrees aislados en `C:/Users/Nahuel/AppData/Local/Temp/opencode/`: `galcoa-flow-auth` (#9), `galcoa-flow-chat` (#16), `galcoa-flow-harness` (#32). Implementadores `claude-code/claude-sonnet-5-5`. La base inicial es `fd3139e`. No se permite resetear simultáneamente la pila local de Supabase: validación con base y procesos browser se reserva y serializa desde el coordinador. El chat no inventa endpoints ausentes; el harness no sustituye factories de producto por clones. Preparaciones parciales no acreditan integración completa.

El usuario confirmó la delegación de #18/#19/#20; GitHub ya tiene `grancobud` como único asignado y comentarios de coordinación. #7 espera confirmación de `galcoa-dev` y permiso específico de aplicar/verificar las cuatro migraciones, sin reset ni borrado. #4 espera dictamen profesional externo.

## Autorizaciones y decisiones externas resueltas (2026-10-16)

Estas decisiones posteriores sustituyen los pendientes iniciales anteriores; no son evidencia de pruebas ejecutadas.

- **Supabase:** `galcoa-dev` confirmado como desarrollo/demo. Autorizadas las cuatro migraciones versionadas y la verificación de catálogo, sin reset ni borrar datos existentes. Autorizada también la corrección exclusiva de los cuatro identificadores del historial para alinearlos con el repo, sin borrar filas ni modificar el SQL aplicado. La ejecución y revisión independientes se registran en el plan de #7.
- **Pruebas remotas:** autorizados dos usuarios ficticios y datos de prueba identificados, con limpieza limitada a lo creado por esas pruebas. Nunca borrar datos previos. No se considera autorizada una limpieza general del proyecto.
- **Auth:** el usuario confirmó en el panel que la confirmación de email está activa. Por decisión del usuario, las URLs de Auth remotas se conservan orientadas a desarrollo local durante la implementación; él cambiará Site URL y callback al dominio de Vercel al terminar los tickets. Ese cambio es un checkpoint de despliegue pendiente, no un bloqueo de desarrollo local.
- **Correo:** se usa el emisor integrado, sin agregar SMTP externo ni servicios nuevos. Demo con cuentas ficticias preparadas; registro/confirmación/recuperación completos se validan en el buzón local. El límite publicado del emisor integrado es de 2 emails/hora y no acredita entrega ni cupos distintos en este proyecto. No prometer registro masivo.
- **Vercel:** proyecto existente `https://galcoa-nea.vercel.app`, configurado por el usuario con variables para `main`. No leer ni imprimir valores. Autorizado abrir y mergear PR de `develop` a `main` únicamente tras aprobar pruebas y revisión de seguridad; no push directo ni release antes de validar.
- **IA:** el usuario exige usar las capas gratuitas de Gemini y Groq, con los modelos seleccionados `gemini-3.5-flash-lite` y `openai/gpt-oss-120b`. No usar el presupuesto orientativo anterior como permiso para consumir planes pagos; sin fallback a modelos pagos ni habilitación de facturación. La disponibilidad y cuota se comprueban en la única sesión real final, no haciendo llamadas reales durante desarrollo.
- **Hedera:** la elección/creación del topic se decide al final. Esta respuesta no autoriza todavía crear topics, fondear cuentas ni enviar transacciones. Se mantiene Testnet como único alcance posible.
- **Jurídica:** uso y demo solo con datos ficticios. El profesional y el dictamen siguen siendo gestiones humanas; #4 no se cierra por tener material preparatorio.

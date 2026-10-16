# Ejecución coordinada de Issues de Nahuel

## Objetivo y autorización

El usuario autorizó ejecutar las tandas desde esta sesión, con worktrees separados, subagentes Sonnet disponibles, validación, PR y merge a `develop`, continuando automáticamente con las tareas habilitadas. No se duplica trabajo de Gastón/Facu ni se declara completada una entrega parcial.

## Secuencia

- [ ] Tanda 0: #3 acceso, #4 preparación de revisión jurídica y #7 preparación/verificación del entorno remoto.
- [ ] Tanda 1: #9 Auth, #16 chat y #32 harness, únicamente checkpoints con entradas disponibles.
- [ ] Tandas de confirmación: #18 → #19 → #20 → #21, con avances disjuntos de #31/#32 cuando estén habilitados.
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

# Segunda tanda: Issues ejecutables para la hackathon

## Objetivo

Publicar Issues autosuficientes para los 31 ExecPlans pendientes, separando las cinco entregas de presentación sin fragmentar módulos funcionales. Mantener el maestro como progreso canónico y la guía por persona como orden de ejecución. No implementar funcionalidades ni ejecutar proveedores reales.

## Decisiones y autorización

El usuario autorizó preparar y publicar Issues, actualizar documentación y entregarla a `develop`. Tres implementers usan explícitamente `openai/gpt-6.1-sol#low`; el orquestador revisa y publica. Facu (`jfacundoayala`) ya es colaborador; Gastón (`grancobud`) tiene invitación pendiente y no inicia hasta aceptarla. Nahuel (`nanonoir`) conserva tareas sensibles. Sin protección de ramas ni checks obligatorios; se preserva el CI y la política de fallos de AGENTS.

## Pasos

- [x] Verificar Issues existentes y colaboradores: ninguna Issue previa; colaboradores `nanonoir` y `jfacundoayala`.
- [x] Redactar tres grupos independientes con una plantilla común, cobertura exacta de IDs y dependencias por checkpoint.
- [x] Revisar personalmente alcance, contratos, permisos, ejecución Git, seguridad y validación.
- [x] Publicar sin duplicados; asignar responsables confirmados y dejar Gastón como previsto hasta aceptar invitación.
- [x] Enlazar dependencias reales, checkpoints y orden por persona, sin marcar implementaciones completadas por crear tickets.
- [x] Validar cuerpos publicados, enlaces, cobertura y ausencia de ciclos artificiales; archivar el plan.

La entrega Git de la documentación a `develop` queda pendiente para la sesión principal; este cierre documental no ejecuta Git ni acredita un commit o SHA de entrega.

## Contrato de las Issues

Cada ticket incluye objetivo, IDs, aceptación, lecturas precisas, entradas integradas necesarias, allowlist y prohibidos, pasos, validaciones y evidencia, límites de credenciales, autorización de rama/commit/push/PR/merge, conflictos explicados en lenguaje sencillo, regla de fallos y cierre. Las gestiones externas se identifican como humanas y no implican acceso automático a servicios. Los checkpoints se consumen por ID integrado, no obligando a terminar todos los IDs del plan productor.

### Ajustes de coordinación confirmados durante la preparación

- GitHub confirma permiso `write` de `jfacundoayala`; `grancobud` tiene invitación `write` sin expirar. `MVP-007` se verifica por persona: su pendiente no bloquea el carril ya autorizado de Facu.
- Las cinco presentaciones se asignan a Facu, una a la vez. Para que complete validación visual y entrega sin esperar un segundo ticket del líder, cada Issue autoriza únicamente el import y la entrada correspondiente en `preview/registry.ts` y sus pruebas, con un solo escritor coordinado. No se amplía configuración, contratos ni backend.
- No se agregan dependencias nativas de Issue completo cuando el requisito real es un checkpoint parcial: los cuerpos enlazan los IDs necesarios con su productor y exigen evidencia integrada en `origin/develop`.

## Validación

Comprobar cobertura de los 60 IDs pendientes, identidades, enlaces y dependencias contra el maestro. Buscar Issues existentes antes de cada publicación y conservar un inventario de números para reanudar sin duplicar. Sin uso ni lectura de secretos.

## Resultado de implementación

### Implementado

- Publicadas 35 Issues en `nanonoir/galcoa` (#3–#37), con cobertura de los 60 IDs abiertos de 31 planes activos. MVP-111…115 se separaron en cinco entregas completas de presentación. Crear tickets no completó IDs funcionales: el maestro conserva 13 completados, uno en curso (MVP-007) y 59 pendientes.
- Tres redactores usaron `openai/gpt-6.1-sol#low`; el orquestador revisó los 35 cuerpos. Las copias revisadas, tres manifests, inventario y protocolo común se conservan en [issue-rollout](../../tasks/issue-rollout/README.md), sin duplicar estados de implementación.
- Actualizados maestro, orden por persona, guías e instrucciones de colaboración y referencias de acceso/presentación. Asignaciones verificadas: 24 Issues a Nahuel, cinco a Facu y seis previstas para Gastón sin asignación formal mientras su invitación siga pendiente.

### Desviaciones del plan

- Se acotó la excepción de preview de Facu a la entrada y pruebas correspondientes, con un único escritor; el acceso pendiente de Gastón no bloquea a Facu.
- Se autorizó configuración Node local de las suites de Gastón hasta integrar el harness: el Vitest global actual no descubre `tests/server/**`.
- Las dependencias enlazan checkpoints por ID integrado, sin bloqueos nativos por Issue completa que creen ciclos artificiales.
- La publicación documental en `develop` no forma parte de este cierre local; queda a cargo de la sesión principal, sin inventar evidencia de entrega.

### Validación

Evidencia de la ejecución recibida para el cierre:

- `galcoa-publish-issues.mjs verify`: PASS, 35 títulos, cuerpos y asignaciones coinciden con el inventario; no había Issues previas ni se generaron duplicados.
- GitHub confirmó colaboradores `nanonoir` y `jfacundoayala`, e invitación pendiente de `grancobud`.
- Revisión completa del orquestador sobre los 35 tickets, incluidos permisos, protocolo Git y dependencias por ID; sin revisión adicional pendiente.
- Validación local previa al cierre: 111 Markdown, 907 enlaces locales y cero rotos (antes de las últimas tres referencias de documentos raíz); 270 enlaces absolutos a fuentes de `develop` comprobados en los tres grupos. `git diff --check`: PASS en la sesión principal.
- Sin cambios de runtime, lectura de secretos ni llamadas a servicios de la aplicación; no correspondía repetir tests de la aplicación. Las únicas acciones externas fueron la publicación y verificación autorizadas en GitHub.

### Seguimiento

- Gastón debe aceptar su invitación antes de ejecutar sus seis Issues; su acceso sigue en MVP-007.
- Las implementaciones y validaciones futuras permanecen en sus Issues y planes activos; no se cierran por esta publicación. La brecha de suites de servidor ya está registrada en la deuda técnica existente (§5) y cubierta por MVP-120/MVP-131; no se duplica.
- Entrega Git de esta documentación pendiente en la sesión principal.

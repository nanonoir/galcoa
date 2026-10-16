# ExecPlan F0 — Acceso del colaborador al repositorio (acción externa)

**Estado: en curso.** Checkpoint de Facu verificado; aceptación de Gastón pendiente. Procedimiento de acceso **fuera del repositorio**, sin código de producto ni automatización de permisos. El [maestro](../mvp-master-plan.md) conserva el progreso.

Tareas del maestro: `MVP-007`

Requisitos PRD: [§13](../../GALCOA-PRD-v1.4.md) (rama corta por ticket, PR, el líder revisa y hace merge; «no se bloquea artificialmente el aporte»). Sin REQ funcional.

Referencias: [arquitectura: delegación y CODEOWNERS](../../../architecture.md) · [desarrollo: entrega del colaborador](../../../development.md) · [fundaciones SH-07](../../../design/mvp-shared-foundations.md) (propiedad de superficies).

## Precondiciones y checkpoints

- Ninguna dependencia en el maestro. Owner: **Externo** (quien administra el repositorio en GitHub; hoy el líder).
- Checkpoints por persona: permisos confirmados por el administrador del repositorio. Facu (`jfacundoayala`) tiene permiso `write` comprobado por GitHub API; Gastón (`grancobud`) tiene invitación `write` pendiente de aceptación. No se inventan accesos.
- La dependencia `MVP-007` se satisface para cada ejecutor individual: Facu puede ejecutar `MVP-111…115` sin esperar a Gastón. El pendiente de Gastón impide que él ejecute sus módulos, no el trabajo de otros ni la creación de sus Issues. **No bloquea `MVP-110`**.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-007 | El líder confirma, con fecha, que el colaborador frontend tiene el acceso acordado al repositorio y que ya puede abrir rama/PR (o fork + PR) según la modalidad elegida. Evidencia en la fila sin datos personales innecesarios; no se inventan handles. |

## Procedimiento (todo manual, fuera del repo)

1. El líder obtiene el identificador de GitHub del colaborador por el canal que ya use. No se escribe en el repositorio salvo que el líder lo decida; `CODEOWNERS` no se modifica (la allowlist del ticket es más fina).
2. El líder elige la modalidad mínima: invitación como colaborador con permiso suficiente para ramas y PR, o fork + PR. Debe ser un permiso sin administración. La elección es del líder; el PRD no la fija.
3. El líder envía la invitación desde la configuración del repositorio en GitHub y el colaborador la acepta.
4. Confirmación manual: el colaborador puede clonar/leer el repositorio y el líder ve el permiso en la lista de colaboradores. No se abre un PR de prueba (sería una acción remota sin necesidad).
5. Onboarding sin secretos: indicar `README.md`, `AGENTS.md`, [desarrollo](../../../development.md) (inicio desde clon limpio) y la plantilla de Issue. La presentación no necesita `.env`.
6. Registrar la evidencia en la fila (ver Cierre).

## Alcance no automatizable

Invitación, aceptación, permisos de GitHub y su verificación son acciones humanas. Ningún agente debe intentar hacerlas con tokens ni contornear permisos.

## Seguridad, permisos y rollback

- El usuario eligió colaboradores con escritura, ramas y PRs con merge autónomo según `AGENTS.md`, sin protección de ramas ni checks obligatorios para la hackathon. El permiso de escritura permite técnicamente subir a la rama base; el equipo acepta ese riesgo y mantiene la regla de no hacerlo salvo pedido explícito.
- Rollback: retirar la invitación o el permiso desde GitHub; no afecta al código.

## Riesgos

- Permiso excesivo por comodidad. Mitigación: modalidad mínima y revisión al llegar `MVP-131`.
- Confundir acceso con delegación: tener acceso no autoriza tocar archivos fuera de la allowlist del ticket.

## Deviaciones y decisiones pendientes

- Sin desviaciones con el maestro: `MVP-007` bloquea solo la ejecución de `MVP-111…115`, no `MVP-110`.
- Modalidad (colaborador directo o fork): decide el líder al ejecutar.

## Referencias a completar

Ninguna.

## Checklist

- [ ] Identificador del colaborador obtenido por el líder.
- [ ] Modalidad mínima elegida.
- [ ] Invitación enviada y aceptada.
- [ ] Acceso confirmado manualmente.
- [ ] Onboarding sin secretos entregado.
- [ ] Fila de `MVP-007` actualizada.

## Progreso y evidencia

2026-10-16: el usuario confirmó a Facu como colaborador y envió la invitación a Gastón. Verificación del orquestador: `gh api repos/nanonoir/galcoa/collaborators/jfacundoayala/permission` devuelve `permission: write`; la invitación de `grancobud` figura con `permissions: write`, sin expirar. No se enviaron nuevas invitaciones ni se alteraron permisos. Se conserva abierto el procedimiento hasta comprobar el acceso de Gastón; el checkpoint de Facu está cumplido.

## Cierre

Actualizar **solo** la fila `MVP-007` (estado `completada`, evidencia: `AAAA-MM-DD · confirmación del líder · modalidad`) y recontar §3 tras integrar. Archivar este plan en [`completed/`](../../completed/). No se marca nada por tener el plan escrito. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en la fila actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). Se archiva únicamente al completar; ningún plan se archiva ahora.

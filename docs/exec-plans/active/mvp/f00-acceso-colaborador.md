# ExecPlan F0 — Acceso del colaborador al repositorio (acción externa)

**Estado: planificado; no ejecutado.** Procedimiento de una acción **fuera del repositorio**; no hay código ni automatización. No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-007`

Requisitos PRD: [§13](../../GALCOA-PRD-v1.4.md) (rama corta por ticket, PR, el líder revisa y hace merge; «no se bloquea artificialmente el aporte»). Sin REQ funcional.

Referencias: [arquitectura: delegación y CODEOWNERS](../../../architecture.md) · [desarrollo: entrega del colaborador](../../../development.md) · [fundaciones SH-07](../../../design/mvp-shared-foundations.md) (propiedad de superficies).

## Precondiciones y checkpoints

- Ninguna dependencia en el maestro. Owner: **Externo** (quien administra el repositorio en GitHub; hoy el líder).
- Checkpoint único: permisos confirmados por una persona con autoridad sobre el repositorio.
- Impacto de no cumplirse: se frena asignar y ejecutar `MVP-111…115` (dependen de `MVP-007`). **No bloquea `MVP-110`**: preparar contratos, allowlists y previews no requiere este acceso.

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

- Hasta que exista protección de ramas verificada (`MVP-131`), la regla «el líder hace los merges» es de **proceso, no técnica**. Con acceso de escritura el colaborador podría subir a la rama base: el líder debe elegir conscientemente fork + PR o aceptar ese riesgo y documentarlo.
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

No ejecutado.

## Cierre

Actualizar **solo** la fila `MVP-007` (estado `completada`, evidencia: `AAAA-MM-DD · confirmación del líder · modalidad`) y recontar §3 tras integrar. Archivar este plan en [`completed/`](../../completed/). No se marca nada por tener el plan escrito. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en la fila actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). Se archiva únicamente al completar; ningún plan se archiva ahora.

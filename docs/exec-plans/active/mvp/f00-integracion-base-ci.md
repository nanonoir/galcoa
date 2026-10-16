# ExecPlan F0 — Integrar la base y obtener el primer run remoto de CI

**Estado: en ejecución.** Entrega autorizada por el usuario; seguimiento en el [maestro](../mvp-master-plan.md). No se completa hasta integrar y comprobar CI en `develop`.

Tareas del maestro: `MVP-006`

Requisitos PRD: transversal (REQ-18 como soporte). [PRD §13](../../GALCOA-PRD-v1.4.md) (PR con checks; el líder integra) y [AGENTS.md](../../../../AGENTS.md) (sin commit/push/merge sin pedido explícito).

Referencias: [fundaciones SH-09](../../../design/mvp-shared-foundations.md) (CI por defecto sin credenciales cloud) · [desarrollo: Navegador y CI](../../../development.md) · [arquitectura](../../../architecture.md) · [deuda técnica](../../tech-debt-tracker.md) (#5).

## Precondiciones y checkpoints

- `MVP-005` completada (histórica: workflow, plantillas y CODEOWNERS están en el árbol, sin run remoto).
- **Autorización explícita del usuario** para commit, push y PR. Los pasos 1–3 son locales y no la requieren; desde el paso 5 sí.
- Checkpoint A (local): inventario, revisión de secretos y checks previos registrados. Checkpoint B (remoto): run verde del commit integrado.
- No frena a otras fases: el trabajo de F1–F3 puede continuar en el árbol local; solo `MVP-006` y lo que dependa de integración (`MVP-131`) esperan.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-006 | (a) La base queda en commits revisables y se prepara `develop` como rama de integración; `main` continúa estable. Hoy solo se presupone la base local `main`, no que `develop` exista. (b) Un run de GitHub Actions en Linux sobre el commit integrado en `develop` está verde y enlazado; fallos corregidos o bloqueo concreto. (c) No se afirma protección de ramas (eso es `MVP-131`). |

## Alcance, roles y carpetas

- Rol: **Líder** (único con permisos de integración). El colaborador no participa.
- Permitido: operaciones de Git sobre el repositorio y correcciones mínimas que el CI exija (workflow, configuración, tests) en el alcance de esta tarea.
- Prohibido: ampliar el producto, instalar dependencias por iniciativa, tocar settings de GitHub (protección de ramas, secretos, permisos), usar `--force`, `--no-verify` ni saltar checks.

## Contratos

- Insumos: árbol de trabajo actual (archivos modificados y sin seguimiento), `.github/workflows/ci.yml`, `.nvmrc`, `package-lock.json`.
- Salidas: commits/PR, URL del run, SHA integrado y resultados reales de los checks.

## Pasos

1. Inventariar con `git status` qué compone la base de preparación (configuración, contratos, mocks, preview, tests, docs) y qué es trabajo documental de planificación aún en curso (`docs/exec-plans/active/`, `docs/design/`). El líder decide qué entra en esta entrega; no se incluye trabajo parcial de otros agentes.
2. Revisión de secretos: confirmar que `.env*` sigue ignorado salvo `.env.example` y que no hay valores sensibles en archivos a versionar (inspeccionar solo archivos a incluir, nunca `.env`/`.env.local`).
3. Checks locales desde instalación limpia con Node 24.18.0: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build`, `npm run test:e2e` (Chromium instalado según [desarrollo](../../../development.md)). Registrar resultados reales; no reutilizar los históricos.
4. Proponer al líder la partición en commits lógicos y PR(s) de tamaño revisable. La partición final es decisión del líder; si excede el presupuesto, dividir en unidades válidas o registrar la excepción de tamaño explícitamente aprobada y su fundamento, sin publicar estados intermedios rotos.
5. Con alcance de entrega autorizado: verificar ramas remotas y acordar el punto de partida de `develop` sin sobrescribir una rama existente; crearla solo si corresponde. Preparar rama/worktree del plan, commits y push al remoto `origin`; PR hacia `develop`. Ajustar el workflow para ejecutar checks también en pushes a `develop` y PRs de integración. No promover cambios a `main` como efecto secundario.
6. Observar el run. Si falla, diagnosticar con los logs y artefactos (retención de 7 días), corregir en commits nuevos y repetir. Los fallos por red pública (npm, Chromium, fuentes) se reintentan, no se enmascaran.
7. Tras revisión del líder y autorización de merge, integrar y comprobar el run de `develop` posterior al merge. Registrar que la base de los siguientes worktrees pasa a ser `develop`; la promoción a `main` es otra entrega autorizada.
8. Registrar evidencia en la fila de `MVP-006`.

## Pruebas y validación

La validación es el propio run de Linux más los checks locales del paso 3. No hay tests nuevos. Los workflows no usan secretos de aplicación ni llaman a Supabase, IA o Hedera.

## Seguridad, permisos y rollback

- Sin autorización de push/PR la tarea queda `pendiente` o `bloqueada` solo ella (se anota en §9 del maestro); el desarrollo local no se detiene.
- Sin reescritura de historial publicado ni force-push. Una reversión se hace con un commit de revert autorizado; borrar ramas remotas requiere autorización.
- No cambiar ajustes de GitHub desde esta tarea.

## Riesgos

- El árbol contiene trabajo ajeno sin commit: mezclarlo en un commit equivocado. Mitigación: inventario del paso 1.
- Diferencias Windows → Linux (finales de línea, mayúsculas en rutas, descarga de `next/font`, navegadores de Playwright). Mitigación: leer el log y corregir la causa.
- Las acciones del workflow (`actions/checkout`, `setup-node`, `upload-artifact`) y su resolución no están verificadas en un run real; un fallo de resolución se corrige aquí.
- Versión de npm del runner distinta de la del lockfile (`engines` pide npm >=11): comprobarlo en el log.

## Decisiones pendientes

- Partición final de commits/PR y qué documentación de planificación entra: decide el líder al ejecutar.

## Referencias a completar

Ninguna: no requiere spec ni diseño adicional.

## Checklist

- [x] Inventario del árbol y decisión de alcance de la entrega.
- [x] Revisión de secretos sobre lo que se versiona.
- [ ] Checks locales previos ejecutados y registrados.
- [x] Autorización explícita de commit/push/PR obtenida.
- [ ] Rama, commits y PR creados.
- [ ] Run de Linux verde enlazado (o fallos corregidos).
- [ ] Merge autorizado y run posterior en la rama base comprobado.
- [ ] Fila de `MVP-006` actualizada con evidencia.

## Progreso y evidencia

2026-10-16: el usuario autorizó commits, push, PR y merge, incluidas **size-exceptions**. Se elige un único PR de preparación con commits lógicos de base técnica y documentación, porque contratos, tooling y scripts están acoplados y deben llegar como una base utilizable. La excepción de tamaño se declarará con el recuento real de código/configuración/tests, separado de documentación y lockfile, en el PR. No se crea etiqueta si el repositorio no define esa política.

Se verificó `origin/develop` existente en `fa82efd227e9acdee8d4c4170b7e4bb89fc8e13f`, igual que `main`; se preservan las ramas existentes, incluida `facu`. Rama de entrega: `delivery/team-foundation`. El workflow pasa a cubrir pushes a `develop` además de `main`. Sin cambios a permisos, secretos o protección de ramas.

Medición de la unidad técnica respecto de esa base: **2.270 líneas añadidas y 9 eliminadas de código/configuración/tests manuales** (2.279 líneas de presupuesto), excluyendo Markdown y lockfile. El lockfile aporta +2.204/−566; las plantillas Markdown +66/−0. La documentación restante se medirá en el PR completo. Excepción de tamaño autorizada explícitamente por el usuario para esta entrega; se mantiene una única unidad de integración para no publicar scripts/configuración sin sus consumidores.

Commit técnico: `3b107db` (`chore: prepare shared frontend workspace and validation`). La validación final corre sobre una copia limpia sin `.env` privados en `C:/Users/Nahuel/AppData/Local/Temp/opencode/galcoa-delivery-jpLgHr`; no se declara verde hasta recibir su resultado.

Pendiente: validación del contenido final, commits, PR, CI Linux y comprobación posterior al merge. Los resultados históricos de preparación no se atribuyen a este commit todavía.

## Cierre

Actualizar **solo** la fila `MVP-006` del maestro (estado, ExecPlan enlazado a `completed/`, evidencia: fecha · comandos · PR · URL del run) y recontar la tabla de §3 tras integrar. Actualizar en el tracker de deuda únicamente la parte de #5 que este run acredita (CI remoto), sin dar por activa la protección de ramas. Archivar este plan en [`completed/`](../../completed/) y conservar el enlace en la fila. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en la fila actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). Se archiva únicamente al completar; ningún plan se archiva ahora.

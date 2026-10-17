# ExecPlan F0 — Integrar la base y obtener el primer run remoto de CI

**Estado: completado y archivado.** Entrega autorizada por el usuario e integrada en `develop`; run de CI verificado exitoso en GitHub Actions; seguimiento en el [maestro](../active/mvp-master-plan.md).

Tareas del maestro: `MVP-006`

Requisitos PRD: transversal (REQ-18 como soporte). [PRD §13](../GALCOA-PRD-v1.4.md) (PR con checks; el líder integra) y [AGENTS.md](../../../AGENTS.md) (sin commit/push/merge sin pedido explícito).

Referencias: [fundaciones SH-09](../../design/mvp-shared-foundations.md) (CI por defecto sin credenciales cloud) · [desarrollo: Navegador y CI](../../development.md) · [arquitectura](../../architecture.md) · [deuda técnica](../tech-debt-tracker.md) (#5).

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
3. Checks locales desde instalación limpia con Node 24.18.0: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build`, `npm run test:e2e` (Chromium instalado según [desarrollo](../../development.md)). Registrar resultados reales; no reutilizar los históricos.
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
- [x] Checks locales previos ejecutados y registrados.
- [x] Autorización explícita de commit/push/PR obtenida.
- [x] Rama, commits y PR creados.
- [x] Run de Linux verde enlazado (o fallos corregidos).
- [x] Merge autorizado y run posterior en la rama base comprobado.
- [x] Fila de `MVP-006` actualizada con evidencia.

## Progreso y evidencia

2026-10-16: el usuario autorizó commits, push, PR y merge, incluidas **size-exceptions** explícitamente aprobadas para toda la preparación. Se eligió un único PR de preparación con commits lógicos de base técnica y documentación, porque contratos, tooling y scripts están acoplados y deben llegar como una base utilizable:
- Commit técnico: `3b107db9db52e11c41716ba693243465e27fbc6a` (`chore: prepare shared frontend workspace and validation`).
- Commit documental: `f1aec997df89424674324b1884111b2913a6ba58` (`docs: add MVP planning pack, specs, designs and execution guide`).

Medición de la unidad técnica respecto de esa base: **2.270 líneas añadidas y 9 eliminadas de código/configuración/tests manuales** (2.279 líneas de presupuesto manual), excluyendo Markdown y lockfile. El lockfile aportó +2.204/−566; la documentación +5.818/−95. Excepción de tamaño autorizada explícitamente por el usuario para esta entrega completa; se mantuvo una única unidad de integración para no publicar scripts/configuración sin sus consumidores ni generar estados intermedios rotos.

Se verificó `origin/develop` existente en `fa82efd227e9acdee8d4c4170b7e4bb89fc8e13f`, al igual que `main` y `facu`; se preservaron intactas todas las ramas existentes sin sobreescritura. Rama de entrega: `delivery/team-foundation`. El workflow `.github/workflows/ci.yml` se configuró para ejecutarse también en pushes a `develop` además de `main`. Sin cambios a permisos, secretos ni branch protection de GitHub (`protection: false`).

Validación local final en copia limpia (`C:/Users/Nahuel/AppData/Local/Temp/opencode/galcoa-delivery-jpLgHr`): `npm ci` (845 paquetes instalados limpiamente), lint, typecheck y build verdes, 91 tests Vitest (incluyen los 51 de barreras, además repetidos por su script) y 15 Playwright (13 preview y 2 smoke Next). Puertos de prueba 4173 y 3100 liberados. Archivos de entorno privados excluidos; únicamente `.env.example` sanitizada versionada (134 archivos de texto verificados sin secretos). Validación documental: 63 archivos Markdown, 770 enlaces locales válidos (0 rotos) y bloque Next de `AGENTS.md` preservado byte por byte. Sin runtime product features nuevas ni llamadas a credenciales de proveedores en vivo.

Revisiones previas internas: sesiones independientes de contratos/tooling y docpack PASS; revisiones formales en GitHub `[]` vacías (no se atribuye aprobación de revisión humana externa en GitHub; merge autorizado por el usuario tras validación interna).

Commits de preparación integrados: `3b107db` (base técnica) y `f1aec99` (documentación). [PR #1](https://github.com/nanonoir/galcoa/pull/1) mergeado a `develop` con merge commit `d6013fe7f2dc4c49b6d8d48ec963947db37f8aa3`.

Ejecución de CI remoto en Linux (Ubuntu runner de GitHub Actions):
- [CI Linux del PR #1 (Run 38883794710)](https://github.com/nanonoir/galcoa/actions/runs/38883794710): exitoso (`success`).
- [CI Linux push post-merge en develop (Run 38883996495)](https://github.com/nanonoir/galcoa/actions/runs/38883996495): exitoso (`success`), cubriendo instalación `npm ci`, lint, tipos, Vitest/barreras, build de Next.js y Playwright en Chromium.

Ramas `main` y `facu` conservadas en `fa82efd`. La base de los siguientes planes y worktrees pasa a ser `develop`.

## Implementation Outcome

### Implemented

1. **Integración de la base en develop:**
   - La base completa de contratos, tooling, preview, suites de pruebas y documentación de planificación fue integrada en `origin/develop` a través del [PR #1](https://github.com/nanonoir/galcoa/pull/1) (merge commit `d6013fe7f2dc4c49b6d8d48ec963947db37f8aa3`), compuesto por el commit técnico `3b107db` y el commit documental `f1aec99`.
   - Preservación íntegra y verificada de las ramas existentes `main` y `facu` en `fa82efd227e9acdee8d4c4170b7e4bb89fc8e13f`.
2. **CI remoto verificado:**
   - Se configuró el disparador de `.github/workflows/ci.yml` para evaluar pushes a `develop` además de `main` y PRs.
   - Se ejecutó y verificó con éxito el pipeline de CI en runners Linux de GitHub Actions tanto para el PR (#38883794710) como para el push posterior a la integración en `develop` (#38883996495).
3. **Cierre y reconciliación documental:**
   - La tarea `MVP-006` quedó marcada como `completada` en el plan maestro con su evidencia real y enlaces a los runs remotos.
   - Este ExecPlan se archiva bajo `docs/exec-plans/completed/f00-integracion-base-ci.md` con sus rutas relativas reconciliadas.

### Deviations from Design

1. **Excepción de tamaño autorizada:** Se aprobó explícitamente por el usuario una excepción de tamaño (+2.270/−9 líneas manuales, +5.818/−95 documentación, +2.204/−566 lockfile) para unificar la preparación en un único PR (`delivery/team-foundation` → `develop`), evitando dejar el repositorio en un estado intermedio roto o incoherente con tooling desfasado de los contratos.
2. **Rama develop preexistente:** `origin/develop` ya existía en el remoto en el mismo commit que `main` (`fa82efd`), por lo que no fue necesario crearla de nuevo sino que se verificó y utilizó como rama destino del PR.
3. **Aviso informativo en runner de CI:** El runner de GitHub Actions (Ubuntu 24.04 con Node LTS) emitió un aviso menor no bloqueante de compatibilidad de plataforma que no afectó la ejecución ni los resultados de los checks.

### Validation

- **Validación local en copia limpia (`galcoa-delivery-jpLgHr`):** `npm ci` (845 paquetes), `npm run lint`, `npm run typecheck`, `npm run build`, 91 tests Vitest (incluye 51 de barreras) y 15 tests Playwright (13 preview, 2 smoke Next) en verde; puertos 3100 y 4173 liberados tras la ejecución.
- **Validación remota en GitHub Actions:** Run pre-PR [#38883794710](https://github.com/nanonoir/galcoa/actions/runs/38883794710) y Run post-merge en develop [#38883996495](https://github.com/nanonoir/galcoa/actions/runs/38883996495) ambos en verde (`success`).
- **Comprobación de secretos y entorno:** 134 archivos de texto analizados; `.env.example` sanitizada; variables locales no agregadas ni expuestas.
- **Validación documental:** 63 archivos Markdown, 770 enlaces validados (0 rotos) y bloque de Next.js en `AGENTS.md` preservado íntegro.

### Follow-up

- **MVP-131:** Protección de ramas en GitHub y ampliación de CI con tests de servidor / RLS cuando se implemente el backend.
- **F1 (`MVP-010…014`):** Inicio de las decisiones abiertas de producto y técnica sobre la base integrada en `develop`.

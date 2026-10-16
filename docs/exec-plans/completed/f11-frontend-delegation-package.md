# F11 · Paquete de delegación frontend

**Estado: completado y archivado.** Tarea cubierta: `MVP-110`.

Tareas del maestro: `MVP-110`

Producto: [PRD v1.5](../GALCOA-PRD-v1.4.md) (REQ-01, REQ-02, REQ-03; PRD §10). Estructura y propiedad: [arquitectura](../../architecture.md#condición-para-delegar-y-primeros-candidatos). Fundaciones: [mvp-shared-foundations](../../design/mvp-shared-foundations.md) (SH-01, SH-02, SH-07, SH-09). Comandos: [desarrollo](../../development.md#checks-según-el-cambio).

## 1. Objetivo y alcance

Dejar listo, **para el líder**, todo lo que la puerta de delegación exige antes de que el colaborador frontend tome `MVP-111…115` (plan hermano [`f11-frontend-presentation-tickets`](f11-frontend-presentation-tickets.md)): contratos de props, escenarios validados con Zod, entrypoints de preview, allowlist por archivo, borradores de ficha/Issue y capturas esperadas.

Entra: contratos y escenarios nuevos de presentación (snapshot, historial, landing/navegación, formularios de acceso), registro en el preview, fichas de ticket y checklist de la puerta. No entra: implementar la presentación (`MVP-111…115`), rutas, containers, endpoints, Auth real, ni crear Issues (no se crean hasta que el usuario autorice la delegación; este plan no inventa handles).

## 2. Trazabilidad

| Fuente | Aplicación |
| --- | --- |
| REQ-02, REQ-01, REQ-03 | Dashboard, historial, formularios de acceso y navegación como presentación |
| INV-02, INV-10, INV-17 | Snapshot y advertencias visibles completas; advertencia crítica nunca deshabilita acciones |
| INV-05, INV-18 | Historial de solo lectura; finalización y sello como estados independientes |
| SH-01 | Contratos distinguen documento, revisión, snapshot y versión; no «última revisión» |
| SH-02 | Proyección compartible con alias de fuentes (no IDs/rutas/URLs privadas); DTO público no recortado en cliente |
| SH-03 | Dimensiones de estado independientes; `loading`/`retrying` son estados técnicos de UI, no valores del PRD |
| SH-07 | Qué es del líder y qué del colaborador; la presentación no importa Next/SDK/red |
| SH-09 | Preview/Vitest/Playwright prueban presentación, no integración real |

## 3. Dependencias

- Del maestro: `MVP-021` (contratos de revisión/versión) y `MVP-004` (preview, completada heredada). `MVP-007` (acceso del colaborador, Externo) **ya no es dependencia de `MVP-110`**: preparar contratos, allowlists y previews no requiere ese acceso.
- **Qué bloquea qué:** `MVP-007` y la autorización del usuario bloquean solo la *ejecución* de `MVP-111…115` (asignar y publicar tickets); los pasos D1–D6 son locales y pueden avanzar sin ellos y `MVP-110` puede completarse sin `MVP-007`. Ejecutar `MVP-111…115` exige `MVP-110` + `MVP-007` + tickets con autorización posterior.
- Por paso: D1 ← `MVP-021`; D2 ← D1; D3 ← D1; D4 ← D2, D3; D5 ← D2, D3, D4; D6 ← D5.
- Nota: contratos de landing y formularios (`MVP-114`, `MVP-115`) no dependen de los dominios de `MVP-021`; pueden prepararse aunque falte el contrato de revisión.

## 4. Archivos: propiedad y límites

| Archivo / zona | Owner | Notas |
| --- | --- | --- |
| `src/features/<dominio>/contracts/*` (props de vista) | Líder | Mismo patrón que [`dashboard-view.ts`](../../../src/features/dashboard/contracts/dashboard-view.ts); props + callbacks originados en cliente |
| `src/mocks/*` (escenarios compartidos), `src/lib/contracts/*` | Líder | Solo dependen de contratos (barrera de [`manifest.mjs`](../../../tests/boundaries/manifest.mjs)) |
| `src/features/<dominio>/fixtures/*` | Líder o colaborador **solo si el ticket lo autoriza** | Datos ficticios validados con Zod |
| `preview/registry.ts` y selector | Líder | Imports explícitos; el colaborador no lo edita |
| `docs/tasks/<ficha>.md` (fichas de ticket) | Líder | Borradores locales, **no Issues publicados** |
| `src/features/*/components/**` | Colaborador, solo allowlist de `MVP-111…115` | Se define aquí, se ejecuta en el plan hermano |
| `src/app/**`, `containers/`, `src/components/ui/`, CSS global, config, manifests, lockfile, CI | Líder / **prohibido** al colaborador | Ampliación solo por autorización explícita |

Dominios de feature propuestos (decisión local del líder al ejecutar D1, no de producto): `dashboard` (existe), `documents` (snapshot, historial), `auth` (formularios; coincide con `src/features/auth/` citado por SH-07), `marketing` (landing y navegación; nombre propuesto, hoy no existe en el árbol objetivo). Se crean carpetas solo cuando la tarea las necesita (AGENTS.md).

## 5. Insumos y salidas

| Salida (Líder) | Contenido mínimo | Consumidor |
| --- | --- | --- |
| Contrato de vista del snapshot | Operación completa + advertencias con fuentes como alias locales (SH-02); dimensiones de estado separadas; sin callbacks de confirmar/finalizar | `MVP-112` |
| Contrato de vista del historial | Versiones con `versionId`/`previousVersionId`, estado de finalización y de sello independientes; callback de selección | `MVP-113` |
| Contrato de landing/navegación | Enlaces como datos (`href` string y etiqueta) provistos por el líder; la presentación no importa `next/link` (barrera `next/*`) | `MVP-114` |
| Contrato de formularios de acceso | Props por formulario: estado de envío, error por campo y global **ya redactado por el servidor/container**, callbacks `onSubmit(...)`; sin lógica de autenticación | `MVP-115` |
| Escenarios validados | Casos nominales + carga/vacío/error + advertencia crítica no bloqueante, ficticios y con IDs/fechas estables | tests y preview |
| Ficha por ticket | Objetivo, referencias, allowlist, prohibidos, props, escenarios, aceptación, capturas | Issue futuro |

Insumo externo: `MVP-021` para los dominios de revisión/versión. Si sus campos exactos aún no existen, los pasos D1 de snapshot e historial quedan pendientes; los demás siguen.

## 6. Pasos y checkpoints

- [x] **D1 · Contratos de props y escenarios** (Líder; ← `MVP-021`). Definir contratos de vista y escenarios por candidato (112–115); la ficha de `MVP-111` usa los contratos ya existentes del dashboard. Validar fixtures con Zod, no solo con tipos. Cada escenario incluye el caso de advertencia crítica **sin** acciones deshabilitadas.
- [x] **D2 · Preview** (Líder; ← D1). Registrar cada presentación en `preview/registry.ts` con escenario seleccionable; el preview sigue sin carga de `.env`, solo loopback y con indicador de datos ficticios. Actualizar su test de arranque.
- [x] **D3 · Allowlist por ticket** (Líder; ← D1). Por cada `MVP-111…115`: archivos exactos del componente, su test y fixtures locales; lista de archivos prohibidos (contratos, mocks compartidos, preview, UI compartida, CSS, rutas, manifests, CI). Sin solapes de archivos entre tickets (112 y 113 comparten carpeta pero no archivos; sin barrel `index`).
- [x] **D4 · Fichas de ticket** (Líder; ← D2, D3). Una por ID, derivada de la [plantilla de Issue](../../../.github/ISSUE_TEMPLATE/frontend-task.md) y reutilizando la [ficha del dashboard](../../tasks/dashboard-presentation.md) como base; nada se publica. Incluye referencia visual o acabado acordado.
- [x] **D5 · Puerta de delegación** (Líder; ← D2, D3, D4). Comprobar con comandos reales que: contrato y escenarios validan; preview arranca sin credenciales; tests de la entrega reproducibles; barreras activas con casos negativos para los nuevos dominios; allowlist revisada. Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` y `npm run test:e2e` (`npm run build`). Registrar resultados reales.
- [x] **D6 · Capturas esperadas y paquete listo** (Líder; ← D5). Por ticket: escenarios y tamaños (360 y 1280 px) a capturar. Marcar el paquete «listo para delegar» sin crear Issues ni asignar a nadie.
- [x] **Checkpoint de autorización y límites de delegación.** Paquete completado e integrado en `develop` local. La publicación de Issues en GitHub y la asignación efectiva corresponden al flujo operativo posterior y no bloquean el cierre técnico de `MVP-110`.

## 7. Validación

- Locales y deterministas: Vitest (contratos y escenarios con casos inválidos rechazados), barreras con casos positivos/negativos, preview smoke. Son **dobles/fixtures**: no acreditan integración Next, Auth, datos reales ni permisos.
- Nada requiere `.env`, red a proveedores ni servicios remotos.
- Cambio de solo Markdown (fichas) → enlaces y diff sin secretos.

## 8. Evidencia

Completado, integrado en `develop` y entregado en `origin/develop` (commit `37a915f`, con env en `7db19b8`, push verificado en lote `ba7af83`; rama limpia en `fab2213..ba7af83`). Contratos reales + fixtures + JSON placeholders en preview; wireframes técnicos aceptados por el líder para primeras entregas; sin UI final ni runtime Auth (deliberadamente fuera de `MVP-110`). Checks completos en `sh_144a6cbea001J7f5tg0v8eGv5W`: exit 0 (lint, types, 222 Vitest incl. 66 tests de límites/boundaries, build de Next.js, 15 Playwright tests). Revisión independiente frontend en sesión `ses_ebb5912acffeQaj7pkuSwfDolg`: PASS.

## 9. Referencias a completar

Documento objetivo disponible:
- **RQ-D2** → [frontend-delivery](../../specs/frontend-delivery.md): contrato común observable, escenarios mínimos por entrega (§2), referencia visual y accesibilidad (§3), paquete y límites de responsabilidad (§4) y aceptación F-01…F-07 (§5). Wireframes técnicos del líder orquestador aceptados para primeras entregas; contratos y esquemas Zod exportados.
- **RQ-D1** → no aplica a este plan.

Borradores de ficha preparados (no son Issues): [índice y huecos](../../tasks/README.md) con las fichas de `MVP-112…115`. Contratos de vista (`src/lib/contracts/{snapshot-view,version-history-view,landing,auth-forms}.ts` y `src/features/{documents,marketing,auth}/contracts/`), escenarios (`src/mocks/{documents,marketing,auth}.ts`) y entradas placeholder del preview probados (Vitest, tsc y ESLint). Wireframes del líder aceptados internamente sin requerir aprobación humana obligatoria; publicación posterior de Issues no bloquea el cierre del paquete.

## 10. Rollback y límites

- Reversible: contratos, escenarios, registro de preview y fichas son archivos nuevos o ediciones acotadas; revertir el cambio devuelve la base previa. No hay migraciones ni acciones remotas.
- Límites: sin Issues, commit, push, PR, merge ni lectura de secretos sin autorización expresa. No se modifican contratos del dashboard existentes salvo extensión compatible. No se diseña producto fuera de P0.

## 11. Cierre

Plan completado y archivado. La tarea `MVP-110` queda marcada como `completada` en el plan maestro [`mvp-master-plan.md`](../active/mvp-master-plan.md) con evidencia verificable. No cierra `MVP-111…115` ni `MVP-116`.

## Implementation Outcome

### Implemented

Se completó integralmente el paquete de delegación frontend para las entregas `MVP-111…115`:
- Contratos de props de vista (`SnapshotViewProps`, `VersionHistoryViewProps`, `LandingViewProps`, `AuthFormProps<T>`) en `src/lib/contracts/` y `src/features/<dominio>/contracts/`.
- Escenarios de datos ficticios rigurosamente validados con Zod en `src/mocks/` (`documents.ts`, `marketing.ts`, `auth.ts`), incorporando advertencias críticas no bloqueantes, estados vacíos, de carga y de error.
- Registro centralizado en `preview/registry.ts` con selectores de escenarios y placeholders JSON renderizables.
- Fichas de trabajo con allowlists estrictas archivo por archivo en `docs/tasks/` para cada entrega (`dashboard-presentation.md`, `snapshot-presentation.md`, `version-history-presentation.md`, `landing-navigation-presentation.md`, `access-forms-presentation.md`).
- Wireframes textuales y layout definidos por el líder orquestador aceptados operativamente para las primeras entregas.

### Deviations from Design

None. Los principios de delimitación arquitectónica se preservaron estrictamente: el líder mantiene el rol de único escritor sobre `preview/registry.ts` y contratos globales. La publicación de Issues en GitHub y la asignación formal de colaboradores se realizarán como paso operativo posterior y no condicionan el cierre técnico de `MVP-110`.

### Deliberately Excluded

- Componentes de UI finales de presentación (`MVP-111…115`): deliberadamente no implementados en este paquete, ya que constituyen el trabajo delegado a Gastón y Facu dentro de sus respectivas allowlists.
- Runtime y endpoints de autenticación: deliberadamente fuera de la presentación, reservados a la integración del líder (`MVP-031`).

### Validation

- Suite Vitest con validación exhaustiva de esquemas Zod de props y fixtures compartidos; verificación de límites arquitectónicos con casos negativos (`tests/boundaries/`).
- Verificación completa del repositorio en runner local `sh_144a6cbea001J7f5tg0v8eGv5W` con exit 0: ESLint, TypeScript check (`tsc --noEmit`), 222 tests en Vitest (incluyendo 66 tests de límites), `npm run build` y 15 tests en Playwright (`npm run test:e2e`).
- Revisión técnica independiente (sesión `ses_ebb5912acffeQaj7pkuSwfDolg`): PASS.

### Follow-up

- Código entregado en `develop` y publicado en `origin/develop` (commit `37a915f`, env `7db19b8`; lote `ba7af83`).
- La ejecución de las entregas de presentación delegadas (`MVP-111…115`) aguardará la confirmación externa de acceso del colaborador (`MVP-007`) y la publicación/asignación de sus respectivos tickets.

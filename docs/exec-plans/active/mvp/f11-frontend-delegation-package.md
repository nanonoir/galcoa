# F11 · Paquete de delegación frontend

**Estado: planificado; implementación no iniciada.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (fila de `MVP-110`). El maestro conserva IDs, estados, dependencias y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-110`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-01, REQ-02, REQ-03; PRD §10). Estructura y propiedad: [arquitectura](../../../architecture.md#condición-para-delegar-y-primeros-candidatos). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-01, SH-02, SH-07, SH-09). Comandos: [desarrollo](../../../development.md#checks-según-el-cambio).

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
| `src/features/<dominio>/contracts/*` (props de vista) | Líder | Mismo patrón que [`dashboard-view.ts`](../../../../src/features/dashboard/contracts/dashboard-view.ts); props + callbacks originados en cliente |
| `src/mocks/*` (escenarios compartidos), `src/lib/contracts/*` | Líder | Solo dependen de contratos (barrera de [`manifest.mjs`](../../../../tests/boundaries/manifest.mjs)) |
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

Todos los checkboxes están pendientes: nada de esto se ha ejecutado.

- [ ] **D1 · Contratos de props y escenarios** (Líder; ← `MVP-021`). Definir contratos de vista y escenarios por candidato (112–115); la ficha de `MVP-111` usa los contratos ya existentes del dashboard. Validar fixtures con Zod, no solo con tipos. Cada escenario incluye el caso de advertencia crítica **sin** acciones deshabilitadas.
- [ ] **D2 · Preview** (Líder; ← D1). Registrar cada presentación en `preview/registry.ts` con escenario seleccionable; el preview sigue sin carga de `.env`, solo loopback y con indicador de datos ficticios. Actualizar su test de arranque.
- [ ] **D3 · Allowlist por ticket** (Líder; ← D1). Por cada `MVP-111…115`: archivos exactos del componente, su test y fixtures locales; lista de archivos prohibidos (contratos, mocks compartidos, preview, UI compartida, CSS, rutas, manifests, CI). Sin solapes de archivos entre tickets (112 y 113 comparten carpeta pero no archivos; sin barrel `index`).
- [ ] **D4 · Fichas de ticket** (Líder; ← D2, D3). Una por ID, derivada de la [plantilla de Issue](../../../../.github/ISSUE_TEMPLATE/frontend-task.md) y reutilizando la [ficha del dashboard](../../../tasks/dashboard-presentation.md) como base; nada se publica. Incluye referencia visual o acabado acordado (hoy no existe para 112–115; ver §9).
- [ ] **D5 · Puerta de delegación** (Líder; ← D2, D3, D4). Comprobar con comandos reales que: contrato y escenarios validan; preview arranca sin credenciales; tests de la entrega reproducibles; barreras activas con casos negativos para los nuevos dominios; allowlist revisada. Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` y, por tocar preview, `npm run test:e2e` (y `npm run build` si cambian rutas/config). Registrar resultados reales.
- [ ] **D6 · Capturas esperadas y paquete listo** (Líder; ← D5). Por ticket: escenarios y tamaños (360 y 1280 px) a capturar. Marcar el paquete «listo para delegar» **sin** crear Issues ni asignar a nadie.
- [ ] **Checkpoint de autorización (externo, no bloquea D1–D6 ni el cierre de `MVP-110`).** Cuando `MVP-007` esté resuelto y el usuario autorice delegar: crear Issues por entrega con la plantilla, citando este plan y la fila del maestro. Hasta entonces, ejecutar `MVP-111…115` requiere `MVP-007` y un ticket posterior con autorización; no se inventan handles.

## 7. Validación

- Locales y deterministas: Vitest (contratos y escenarios con casos inválidos rechazados), barreras con casos positivos/negativos, preview smoke. Son **dobles/fixtures**: no acreditan integración Next, Auth, datos reales ni permisos.
- Nada requiere `.env`, red a proveedores ni servicios remotos.
- Cambio de solo Markdown (fichas) → enlaces y diff sin secretos.

## 8. Evidencia

No ejecutada. Al ejecutar: fecha · comandos y resultado reales · rama/PR/commit. No se reutilizan resultados históricos (91 tests / 15 Playwright de `team-workspace-readiness`).

## 9. Referencias a completar

Documento objetivo **disponible** (justificado por las cinco entregas delegables; no condicional):

- **RQ-D2** → [frontend-delivery](../../../specs/frontend-delivery.md): contrato común observable, escenarios mínimos por entrega (§2), referencia visual y accesibilidad (§3), paquete y límites de responsabilidad (§4) y aceptación F-01…F-07 (§5). D3/D4 lo consumen para las fichas de `MVP-112…115` junto con la ficha reutilizable del dashboard. Su registro operativo (§6: acabado de 112…115, props y nombres concretos) sigue siendo **propuesta no aprobada** que el líder cierra en `MVP-110`; la spec no completa `MVP-110`.
- **RQ-D1** → no aplica a este plan.

Borradores de ficha preparados (no son Issues): [índice y huecos](../../../tasks/README.md) con las fichas de `MVP-112…115`. Contratos de vista (`src/lib/contracts/{snapshot-view,version-history-view,landing,auth-forms}.ts` y `src/features/{documents,marketing,auth}/contracts/`), escenarios (`src/mocks/{documents,marketing,auth}.ts`) y entradas placeholder del preview existen y están probados (Vitest, tsc y ESLint); pendiente la aprobación humana de la referencia visual, la publicación de Issues y el cierre formal de `MVP-110`.

Decisiones locales abiertas (del líder, no de producto): nombres de dominios de feature y rutas de contratos de vista (§4); acabado visual de 112–115.

## 10. Rollback y límites

- Reversible: contratos, escenarios, registro de preview y fichas son archivos nuevos o ediciones acotadas; revertir el cambio devuelve la base previa. No hay migraciones ni acciones remotas.
- Límites: sin Issues, commit, push, PR, merge ni lectura de secretos sin autorización expresa. No se modifican contratos del dashboard existentes salvo extensión compatible. No se diseña producto fuera de P0.

## 11. Cierre

Se cierra cuando el paquete de `MVP-110` está **integrado en la base del equipo**, la puerta (D5) se repitió sobre la integración con evidencia real y la aceptación de la fila se cumple. Entonces: registrar evidencia en la fila `MVP-110` del maestro, actualizar el recuento del §3 del maestro (comando del propio maestro). Este plan no cierra `MVP-111…115` ni `MVP-116`. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

# F11 · Presentación delegable: dashboard, snapshot, historial, landing y formularios de acceso

**Estado: planificado; implementación no iniciada.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-111…115`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-111`, `MVP-112`, `MVP-113`, `MVP-114`, `MVP-115`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-01, REQ-02, REQ-03; PRD §5, §10, §11). Estructura y propiedad: [arquitectura](../../../architecture.md#condición-para-delegar-y-primeros-candidatos). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-02, SH-03, SH-07, SH-09). Paquete previo: [`f11-frontend-delegation-package`](../../completed/f11-frontend-delegation-package.md).

## 1. Objetivo y alcance

Cinco entregas de **presentación simple** con callbacks, sin red, sin SDK, sin rutas y sin autoridad de negocio. Se agrupan en un plan porque comparten puerta (`MVP-110`), reglas, validación y evidencia, pero son **independientes entre sí**: cada una tiene su allowlist y puede entregarse, revisarse e integrarse por separado.

Fuera de alcance: rutas, containers, endpoints, Auth real, chat interactivo, confirmación pública y verificador (son del líder: `MVP-031`, `054`, `076`, `101`), cualquier cambio de contratos o de producto. La integración con servidores es `MVP-116` ([plan hermano](f11-product-ui-integration-and-review.md)).

**Ejecución delegada:** requiere un ticket posterior (Issue con la plantilla de `.github/`) y autorización del usuario; este plan **no crea Issues ni asigna a nadie** y no inventa handles. Si el líder implementa una entrega por su cuenta, aplican las mismas allowlist y barreras.

## 2. Trazabilidad

| ID | REQ / INV / SH | Idea de aceptación (detalle en la fila del maestro) |
| --- | --- | --- |
| `MVP-111` | REQ-02; INV-02, INV-10; SH-03 | Lista, vacío, carga y error; dimensiones de estado sin mezclar; advertencia crítica no bloquea |
| `MVP-112` | REQ-08 (presentación), REQ-12/13 (contenido idéntico); INV-02, INV-11, INV-14, INV-17; SH-02, SH-03 | Contenido completo + advertencias con fuentes como alias; sin confirmar/finalizar |
| `MVP-113` | REQ-09, REQ-10 (estados); INV-05, INV-18; SH-01, SH-03 | Versiones con finalización y sello independientes; lectura + callback de selección |
| `MVP-114` | REQ-02 (navegación); PRD §5, §11 (lenguaje) | Landing y navegación accesibles; sin afirmaciones prohibidas |
| `MVP-115` | REQ-01; PRD §11 | Login, registro y recuperación como presentación; sin lógica de autenticación |

## 3. Dependencias

- Del maestro: las cinco dependen de `MVP-110` y de `MVP-007` (handle y permisos del colaborador, Externo). `MVP-110` ya no depende de `MVP-007`: el paquete se prepara sin ese acceso, pero ejecutar `MVP-111…115` requiere ambos más tickets con autorización posterior. Ver [paquete](../../completed/f11-frontend-delegation-package.md).
- Entre entregas: ninguna. Un fallo o retraso de una no bloquea a las otras. Las integraciones que las consumen (`MVP-116`, `MVP-031`) dependen de su integración, no de su orden.
- Por paso (cada entrega): E1 ← `MVP-110`; E2 ← E1; E3 ← E2; E4 ← E3 (revisión y validación del líder); E5 ← E4 (integración).

## 4. Archivos: allowlist y prohibidos (propuesta; la confirma cada ticket)

Nombres propuestos; el ticket fija los definitivos. Cada entrega incluye componente, su test (`*.test.tsx`) y, si el ticket lo autoriza, fixtures locales en `src/features/<dominio>/fixtures/`.

| ID | Archivos permitidos | Contrato (lo entrega el líder en `MVP-110`) |
| --- | --- | --- |
| `MVP-111` | [`dashboard-reference.tsx`](../../../../src/features/dashboard/components/dashboard-reference.tsx) y [`dashboard-reference.test.tsx`](../../../../src/features/dashboard/components/dashboard-reference.test.tsx) | [`DashboardViewProps`](../../../../src/features/dashboard/contracts/dashboard-view.ts); base de la [ficha existente](../../../tasks/dashboard-presentation.md) |
| `MVP-112` | `snapshot-view.tsx` y `snapshot-view.test.tsx` en `src/features/documents/components/` ([ficha](../../../tasks/snapshot-presentation.md)) | Contrato de vista del snapshot (propuesto) |
| `MVP-113` | `version-history.tsx` y `version-history.test.tsx` en `src/features/documents/components/`, **distintos** de los de 112 ([ficha](../../../tasks/version-history-presentation.md)) | Contrato de vista del historial (propuesto) |
| `MVP-114` | `landing-page.tsx`, `site-navigation.tsx` y un `.test.tsx` por cada uno en `src/features/marketing/components/` (carpeta propuesta; [ficha](../../../tasks/landing-navigation-presentation.md)) | Contrato de landing/navegación con enlaces como datos |
| `MVP-115` | `login-form`, `register-form`, `recovery-request-form` y `new-password-form` (`.tsx` + `.test.tsx` cada uno) en `src/features/auth/components/` (carpeta propuesta; [ficha](../../../tasks/access-forms-presentation.md)) | Contrato de formularios con callbacks y errores provistos |

Nombres de archivo propuestos; el Issue los confirma. Índice, asignación propuesta y huecos del lado del líder: [`docs/tasks/README.md`](../../../tasks/README.md).

**Prohibido para el colaborador en todas** (solo con ampliación expresa del líder): `src/lib/contracts/`, `src/mocks/`, `preview/`, `src/components/ui/`, `src/hooks/`, `src/app/`, `containers/`, CSS global, `package.json`/lockfile, configuración, CI, `.github/`, migraciones, `.env*`. Se mantiene la barrera: la presentación no importa `next/*`, SDK, Node ni red (por eso `MVP-114` usa `href` como dato y `MVP-115` no usa `fetch` ni Supabase).

## 5. Insumos y salidas

| Entrega | Insumos (Líder) | Salida (Colaborador → Líder) |
| --- | --- | --- |
| 111–115 | Contrato de props, escenarios, entrypoint de preview, ficha | Componente + tests + capturas a 360 y 1280 px + PR con checks reales |
| Líder tras cada PR | — | Revisión, validación sobre la integración, integración en la base |

Salida contractual para integraciones: los props de 111 y 113 los consume `MVP-116`; los de 115 los consume `MVP-031` (plan de Auth, otro redactor); los de 112 los consume `MVP-077`. Cualquier cambio de props que pida el colaborador lo decide el líder, no se resuelve en el componente.

## 6. Pasos y checkpoints

Todos pendientes. Cada entrega repite el mismo ciclo; se anotan solo los criterios propios.

- [ ] **E1 · Preparación del ticket** (Líder; ← `MVP-110`, `MVP-007`, autorización del usuario). Publicar el Issue de la entrega con allowlist y capturas esperadas.
- [ ] **E2 · Implementación** (Colaborador, rama corta). Solo allowlist. Texto como contenido, nunca HTML arbitrario.
- [ ] **E3 · Validación del colaborador.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`; `npm run build` y `npm run test:e2e` cuando toque interacciones/preview. Resultados reales en el PR.
- [ ] **E4 · Revisión del líder.** Contra la aceptación de la fila y los criterios siguientes.
- [ ] **E5 · Integración** y repetición de checks relevantes sobre la base integrada.

**Criterios por entrega**

- `MVP-111`: renderiza los 8 escenarios del dashboard (`loading`, `error`, `empty`, `commercial`, `measurement`, `confirmations`, `finalized-pending`, `finalized-registered`); confirmación `null` = ausencia de revisión; crear/abrir/reintentar llaman solo su callback; 360/1280 px sin desbordamiento horizontal. Criterios ya detallados en la [ficha](../../../tasks/dashboard-presentation.md).
- `MVP-112`: muestra el contenido completo y las advertencias **sin ocultar contradicciones críticas**; fuentes como alias descriptivos, no enlaces ni IDs internos; estados de documento/control/confirmaciones/sello separados; sin botones de confirmar, rechazar, congelar ni finalizar; test con advertencia crítica y acciones no deshabilitadas por ella.
- `MVP-113`: finalización y sello se leen como estados independientes («Versión finalizada; sello pendiente» y «registrado» no se funden); un intento HCS `fallido` mantiene el sello pendiente y no se presenta como finalización fallida; solo lectura y `onSelect(versionId)`; sin reintento de sello ni regeneración.
- `MVP-114`: navegación por teclado, nombres accesibles, responsive; **no** usar «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» ni «identidad verificada» (PRD §5, §11); sin pagos, Mainnet ni promesas de envío automático (fuera de P0). Test que busca las cadenas prohibidas en el render de los escenarios.
- `MVP-115`: formularios de login, registro, solicitud de recuperación y **nueva contraseña**, cada uno con su escenario y callback; etiquetas, `autocomplete` y errores asociados a su campo; estado de envío con doble clic evitado a nivel visual (la idempotencia real es del servidor); el error global se muestra tal como lo entrega el container, sin lógica que distinga «cuenta existente» (el servidor no filtra existencia, `MVP-031`); campo de contraseña sin eco en logs ni `console`.

## 7. Validación

- Vitest de componentes (jsdom) con fixtures y fixtures inválidos rechazados por Zod; barreras; capturas manuales del preview. Todo es **doble/fixture**: no acredita permisos ni datos reales.
- Playwright sobre el preview solo si la entrega añade interacción navegable.
- Ninguna validación exige `.env`, Supabase, proveedores de IA ni Hedera.

## 8. Evidencia

No ejecutada. Por entrega: fecha · comandos y resultado reales · rama/PR/commit · capturas y escenarios usados.

## 9. Referencias a completar

Documento objetivo **disponible** (no condicional):

- **RQ-D2** → [frontend-delivery](../../../specs/frontend-delivery.md): escenarios mínimos por entrega (§2), referencia visual y accesibilidad (§3), allowlists y límites (§4) y aceptación F-01…F-07 (§5), que las fichas de `MVP-111…115` citan junto con la ficha reutilizable del dashboard. Las referencias visuales y los nombres concretos por entrega los fija el líder en `MVP-110` (§6 de la spec, propuesta no aprobada).
- **RQ-D1** → no aplica.

## 10. Rollback y límites

- Cada entrega es una rama/PR aislada: revertir su merge restaura el estado previo; no toca contratos, datos ni servicios.
- Una entrega que exija archivos fuera de su allowlist se detiene y pide ampliación; no se amplía por iniciativa propia.
- Sin Issues, commit, push, PR ni merge sin pedido o ticket; sin secretos ni proveedores.

## 11. Cierre

Cada ID se cierra por separado: aceptación de su fila cumplida y validada **tras integrarse** en la base, con evidencia real en la fila del maestro. Al cerrar el último de los cinco: actualizar el recuento del §3 del maestro. La presentación integrada no completa `MVP-116`, `031` ni `077`. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

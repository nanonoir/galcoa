# F11 · Presentación delegable: dashboard, snapshot, historial, landing y formularios de acceso

**Estado: completado y archivado (2026-10-16).** Cinco presentaciones integradas en `develop` y verificadas por el coordinador. ExecPlan derivado del [plan maestro](../active/mvp-master-plan.md), filas `MVP-111…115`; no cierra integraciones de producto.

Tareas del maestro: `MVP-111`, `MVP-112`, `MVP-113`, `MVP-114`, `MVP-115`

Producto: [PRD v1.5](../GALCOA-PRD-v1.4.md) (REQ-01, REQ-02, REQ-03; PRD §5, §10, §11). Estructura y propiedad: [arquitectura](../../architecture.md#condición-para-delegar-y-primeros-candidatos). Fundaciones: [mvp-shared-foundations](../../design/mvp-shared-foundations.md) (SH-02, SH-03, SH-07, SH-09). Paquete previo: [`f11-frontend-delegation-package`](f11-frontend-delegation-package.md).

## 1. Objetivo y alcance

Cinco entregas de **presentación simple** con callbacks, sin red, sin SDK, sin rutas y sin autoridad de negocio. Se agrupan en un plan porque comparten puerta (`MVP-110`), reglas, validación y evidencia, pero son **independientes entre sí**: cada una tiene su allowlist y puede entregarse, revisarse e integrarse por separado.

Fuera de alcance: rutas, containers, endpoints, Auth real, chat interactivo, confirmación pública y verificador (`MVP-031`, `054`, `076`, `101`), cualquier cambio de contratos o de producto. La integración con servidores es `MVP-116` ([plan hermano](../active/mvp/f11-product-ui-integration-and-review.md)).

**Ejecución delegada:** requiere un ticket posterior (Issue con la plantilla de `.github/`) y autorización del usuario; este plan **no crea Issues ni asigna a nadie** y no inventa handles. Si el líder implementa una entrega por su cuenta, aplican las mismas allowlist y barreras.

**Autorización de la segunda tanda:** las cinco entregas se asignan a Facu (`@jfacundoayala`), una a la vez. Su checkpoint personal de acceso está comprobado y no espera a Gastón. Las Issues autorizan a Claude a crear rama desde `origin/develop`, trabajar, publicar PR y mergear con las reglas de `AGENTS.md`, sin aprobación humana obligatoria. Las menciones históricas a revisión/merge exclusivos del líder no son un gate adicional.

## 2. Trazabilidad

| ID | REQ / INV / SH | Idea de aceptación (detalle en la fila del maestro) |
| --- | --- | --- |
| `MVP-111` | REQ-02; INV-02, INV-10; SH-03 | Lista, vacío, carga y error; dimensiones de estado sin mezclar; advertencia crítica no bloquea |
| `MVP-112` | REQ-08 (presentación), REQ-12/13 (contenido idéntico); INV-02, INV-11, INV-14, INV-17; SH-02, SH-03 | Contenido completo + advertencias con fuentes como alias; sin confirmar/finalizar |
| `MVP-113` | REQ-09, REQ-10 (estados); INV-05, INV-18; SH-01, SH-03 | Versiones con finalización y sello independientes; lectura + callback de selección |
| `MVP-114` | REQ-02 (navegación); PRD §5, §11 (lenguaje) | Landing y navegación accesibles; sin afirmaciones prohibidas |
| `MVP-115` | REQ-01; PRD §11 | Login, registro y recuperación como presentación; sin lógica de autenticación |

## 3. Dependencias

- Del maestro: las cinco dependen de `MVP-110` y de `MVP-007` (handle y permisos del colaborador, Externo), ambos completados. `MVP-110` ya no depende de `MVP-007`: el paquete se prepara sin ese acceso, pero ejecutar `MVP-111…115` requiere ambos más tickets autorizados. Ver [paquete](f11-frontend-delegation-package.md).
- Entre entregas: ninguna. Un fallo o retraso de una no bloquea a las otras. Las integraciones que las consumen (`MVP-116`, `MVP-031`) dependen de su integración, no de su orden.
- Por paso (cada entrega): E1 ← `MVP-110`; E2 ← E1; E3 ← E2; E4 ← E3 (revisión y validación del líder); E5 ← E4 (integración).

## 4. Archivos: allowlist y prohibidos (propuesta; la confirma cada ticket)

Nombres propuestos; el ticket fija los definitivos. Cada entrega incluye componente, su test (`*.test.tsx`) y, si el ticket lo autoriza, fixtures locales en `src/features/<dominio>/fixtures/`.

| ID | Archivos permitidos | Contrato (lo entrega el líder en `MVP-110`) |
| --- | --- | --- |
| `MVP-111` | [`dashboard-reference.tsx`](../../../src/features/dashboard/components/dashboard-reference.tsx) y [`dashboard-reference.test.tsx`](../../../src/features/dashboard/components/dashboard-reference.test.tsx) | [`DashboardViewProps`](../../../src/features/dashboard/contracts/dashboard-view.ts); base de la [ficha existente](../../tasks/dashboard-presentation.md) |
| `MVP-112` | `snapshot-view.tsx` y `snapshot-view.test.tsx` en `src/features/documents/components/` ([ficha](../../tasks/snapshot-presentation.md)) | Contrato de vista del snapshot |
| `MVP-113` | `version-history.tsx` y `version-history.test.tsx` en `src/features/documents/components/`, **distintos** de los de 112 ([ficha](../../tasks/version-history-presentation.md)) | Contrato de vista del historial |
| `MVP-114` | `landing-page.tsx`, `site-navigation.tsx` y un `.test.tsx` por cada uno en `src/features/marketing/components/` ([ficha](../../tasks/landing-navigation-presentation.md)) | Contrato de landing/navegación con enlaces como datos |
| `MVP-115` | `login-form`, `register-form`, `recovery-request-form` y `new-password-form` (`.tsx` + `.test.tsx` cada uno) en `src/features/auth/components/` ([ficha](../../tasks/access-forms-presentation.md)) | Contrato de formularios con callbacks y errores provistos |

Los Issues confirmaron los archivos. Índice de fichas: [`docs/tasks/README.md`](../../tasks/README.md).

**Prohibido para el colaborador en todas** (solo con ampliación expresa del líder): `src/lib/contracts/`, `src/mocks/`, `preview/`, `src/components/ui/`, `src/hooks/`, `src/app/`, `containers/`, CSS global, `package.json`/lockfile, configuración, CI, `.github/`, migraciones, `.env*`. Se mantiene la barrera: la presentación no importa `next/*`, SDK, Node ni red (por eso `MVP-114` usa `href` como dato y `MVP-115` no usa `fetch` ni Supabase).

**Ampliación expresa y acotada para estas Issues:** Facu puede editar el import y únicamente la entrada de su componente en `preview/registry.ts`, su prueba en `preview/registry.test.tsx` y sus casos en `tests/e2e/preview.spec.ts`. No modifica configuración ni otras entradas/pruebas. Es el único escritor delegado durante su ticket, por lo que el líder no toca esos archivos simultáneamente. Se mantiene una presentación activa por vez. Esto permite capturar la UI real, no el placeholder JSON, sin otro ticket o intervención manual.

## 5. Insumos y salidas

| Entrega | Insumos (Líder) | Salida (Colaborador → Líder) |
| --- | --- | --- |
| 111–115 | Contrato de props, escenarios, entrypoint de preview, ficha | Componente + tests + capturas a 360 y 1280 px + PR con checks reales |
| Líder tras cada PR | — | Revisión, validación sobre la integración, integración en la base |

Salida contractual para integraciones: los props de 111 y 113 los consume `MVP-116`; los de 115 los consume `MVP-031` (plan de Auth, otro redactor); los de 112 los consume `MVP-077`. Cualquier cambio de props que pida el colaborador lo decide el líder, no se resuelve en el componente.

## 6. Pasos y checkpoints

Los cinco ciclos E1–E5 están completos; la evidencia conjunta y sus límites constan al final.

- [x] **E1 · Preparación del ticket:** Issues #26…30 asignadas a Facu, con allowlist y capturas.
- [x] **E2 · Implementación:** cinco entregas de presentación y tests, con ampliación expresa del preview.
- [x] **E3 · Validación del colaborador:** checks registrados en los PR; build y 89 E2E informados por Facu en #61.
- [x] **E4 · Revisión del líder:** aceptación de las cinco vistas y validación conjunta, sin bloqueantes de presentación.
- [x] **E5 · Integración:** PR #52/#58/#59/#60/#61 mergeados; resolución final de Facu conservada y comparada semánticamente por el coordinador.

**Criterios por entrega**

- `MVP-111`: renderiza los 8 escenarios del dashboard (`loading`, `error`, `empty`, `commercial`, `measurement`, `confirmations`, `finalized-pending`, `finalized-registered`); confirmación `null` = ausencia de revisión; crear/abrir/reintentar llaman solo su callback; 360/1280 px sin desbordamiento horizontal. Criterios ya detallados en la [ficha](../../tasks/dashboard-presentation.md).
- `MVP-112`: muestra el contenido completo y las advertencias **sin ocultar contradicciones críticas**; fuentes como alias descriptivos, no enlaces ni IDs internos; estados de documento/control/confirmaciones/sello separados; sin botones de confirmar, rechazar, congelar ni finalizar; test con advertencia crítica y acciones no deshabilitadas por ella.
- `MVP-113`: finalización y sello se leen como estados independientes («Versión finalizada; sello pendiente» y «registrado» no se funden); un intento HCS `fallido` mantiene el sello pendiente y no se presenta como finalización fallida; solo lectura y `onSelect(versionId)`; sin reintento de sello ni regeneración.
- `MVP-114`: navegación por teclado, nombres accesibles, responsive; **no** usar «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» ni «identidad verificada» (PRD §5, §11); sin pagos, Mainnet ni promesas de envío automático (fuera de P0). Test que busca las cadenas prohibidas en el render de los escenarios.
- `MVP-115`: formularios de login, registro, solicitud de recuperación y **nueva contraseña**, cada uno con su escenario y callback; etiquetas, `autocomplete` y errores asociados a su campo; estado de envío con doble clic evitado a nivel visual (la idempotencia real es del servidor); el error global se muestra tal como lo entrega el container, sin lógica que distinga «cuenta existente» (el servidor no filtra existencia, `MVP-031`); campo de contraseña sin eco en logs ni `console`.

## 7. Validación

- Vitest de componentes (jsdom) con fixtures y fixtures inválidos rechazados por Zod; barreras; capturas manuales del preview. Todo es **doble/fixture**: no acredita permisos ni datos reales.
- Playwright sobre el preview solo si la entrega añade interacción navegable.
- Ninguna validación exige `.env`, Supabase, proveedores de IA ni Hedera.

## 8. Evidencia

Evidencia del 2026-10-16: [revisión y corrida del coordinador](https://github.com/nanonoir/galcoa/pull/61#issuecomment-6221688015), sobre `79d0a2c`, y [checks informados por Facu](https://github.com/nanonoir/galcoa/pull/61#issuecomment-6221685147). Se distinguen las dos corridas en el resultado final.

## 9. Referencias a completar

Documento objetivo **disponible** (no condicional):

- **RQ-D2** → [frontend-delivery](../../specs/frontend-delivery.md): escenarios mínimos por entrega (§2), referencia visual y accesibilidad (§3), allowlists y límites (§4) y aceptación F-01…F-07 (§5), que las fichas de `MVP-111…115` citan junto con la ficha reutilizable del dashboard. Referencia visual técnica aceptada en `MVP-110`, según §6 de la spec.
- **RQ-D1** → no aplica.

## 10. Rollback y límites

- Cada entrega es una rama/PR aislada: revertir su merge restaura el estado previo; no toca contratos, datos ni servicios.
- Una entrega que exija archivos fuera de su allowlist se detiene y pide ampliación; no se amplía por iniciativa propia.
- Sin Issues, commit, push, PR ni merge sin pedido o ticket; sin secretos ni proveedores.

## 11. Cierre

Se completaron únicamente `MVP-111…115`; el maestro y el catálogo reflejan este archivo. La presentación no completa `MVP-116`, `118`, `031` ni `077`; sus responsables e integraciones no se modifican en este cierre.

## Resultado de implementación

### Implementado

| ID | Entrega aceptada | PR integrado · merge |
| --- | --- | --- |
| MVP-111 | Ocho escenarios del dashboard, callbacks crear/abrir/reintentar, advertencias no bloqueantes y dimensiones separadas | [#52](https://github.com/nanonoir/galcoa/pull/52) · `7790a9d` |
| MVP-112 | Snapshot completo, contradicción con dos fuentes alias, contenido largo, sin IDs/enlaces privados ni acciones de confirmar/congelar/finalizar | [#59](https://github.com/nanonoir/galcoa/pull/59) · `8a00f8c` |
| MVP-113 | Historial con selección controlada, antecedente y sellos independientes por versión; sello fallido mantiene finalización | [#60](https://github.com/nanonoir/galcoa/pull/60) · `43a4ad4` |
| MVP-114 | Landing y menú responsive con teclado y retorno de foco, enlaces como datos y tests de lenguaje P0 | [#61](https://github.com/nanonoir/galcoa/pull/61) · `dc2ccb2` |
| MVP-115 | Cuatro formularios, labels/autocomplete/errores asociados, envío visual único y callbacks sin Auth ni exposición de contraseñas | [#58](https://github.com/nanonoir/galcoa/pull/58) · `f178f3e` |

Las cinco entradas reales y todos sus tests permanecen en el preview final; contratos y servicios no se implementan aquí. La reconciliación contrastó fichas/spec con componentes, pruebas y registro, sin una nueva revisión de ingeniería.

### Desviaciones del diseño

La allowlist se amplió expresamente a la entrada y pruebas de preview de cada ticket (§4). El coordinador no ejecutó build Next en su corrida: presentación/preview sin rutas nuevas; el build y 89 E2E los informó Facu, no se atribuyen al coordinador. Vercel agotó su cuota de despliegues en #61; fallo no sensible advertido antes del merge, no prueba de fallo de presentación ni validación remota.

### Validación

El coordinador ejecutó sobre `79d0a2c`: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (829 PASS), `npm.cmd run test:boundaries` (67 PASS) y Playwright preview completo (87 PASS). Incluyó capturas a 360/1280 px de las cinco vistas, teclado/foco/menú, ausencia de red, fuentes inválidas y ausencia de acciones de congelar/confirmar/finalizar. Comparó su resolución con la publicada por Facu: equivalencia semántica, conservando esta última sin merge redundante. GitHub confirma los cinco PR MERGED y #61 integrado como `dc2ccb2`; revisión final de presentación sin bloqueantes. No se probó runtime Auth/servidor por esta corrida ni se acredita producto integrado.

Validación documental del cierre: 73 filas, únicamente MVP-111…115 modificadas; 27 completadas, 27 en curso, 19 pendientes (F11: 6/8). Catálogo: 36 planes, 26 activos y 10 archivados. Enlaces del plan y referencias entrantes actualizados; `git diff --check` correcto. Los dos enlaces F2 preexistentes en clientes Supabase/entorno remoto quedan fuera de este cierre. No se reejecutaron suites de código por estos cambios exclusivamente documentales.

### Seguimiento

Continúan por sus propios planes la integración de producto `MVP-116`, revisión transversal `MVP-118` y UI del autor `MVP-077`. `MVP-031` tiene evidencia independiente; no se modifica ni revalida aquí. No se generó deuda técnica nueva: los pendientes ya tienen IDs propios. Al consultar GitHub, #26/#27/#29/#30 estaban cerradas y #28 seguía abierta pese al merge #60; queda su cierre operativo, no implementación pendiente.

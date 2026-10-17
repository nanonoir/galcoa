# Ficha de delegación: presentación del historial de versiones (MVP-113)

**Estado: presentación completada por Facu e integrada por PR [#60](https://github.com/nanonoir/galcoa/pull/60).** Issue #28 aún abierta al consultar: cierre operativo pendiente, no implementación. Aceptación verificada; evidencia y límites en el [plan cerrado](../exec-plans/completed/f11-frontend-presentation-tickets.md#resultado-de-implementación). La lista conserva criterios del ticket, no trabajo pendiente. Reglas: [dashboard-presentation](dashboard-presentation.md), [frontend-delivery](../specs/frontend-delivery.md) (§2–§5, F-03, F-06, F-07).

## Objetivo

Listar las versiones de un documento (v1, v2…) con su antecedente, y mostrar **finalización** y **sello HCS** como estados independientes, con selección por callback. Solo lectura: sin edición, regeneración de PDF ni reintento de sello (MVP-116 y servicios del líder).

Referencias: PRD REQ-09, REQ-10 (estados), INV-05, INV-18, §5, §10; [SH-01, SH-03](../design/mvp-shared-foundations.md).

## Contrato y alcance

- Props (existen): `VersionHistoryViewProps { state; selectedVersionId: string | null; onSelect(versionId); onRetry }` en `src/features/documents/contracts/version-history-view.ts`. Estado: `VersionHistoryViewState` en `src/lib/contracts/version-history-view.ts` (`loading` · `error{message}` · `ready{versions: VersionHistoryItem[]}`; item: `versionId`, `number`, `previousVersionId`, `revisionId`, `snapshotId`, `finalizedAt`, `hcsStatus`). Sin PDF, manifiesto ni hashes. Historial vacío = `ready` con `versions: []`. Un sello `fallido` se lee como sello pendiente, no como finalización fallida.
- Escenarios: `versionHistoryScenarios` en `src/mocks/documents.ts` — `loading`, `error`, `empty`, `single-registered`, `v1-registered-v2-pending`, `seal-failed` (cada uno con su `selectedVersionId`). Preview real: «Historial (MVP-113)».

**Allowlist propuesta (a confirmar en el Issue):**

1. `src/features/documents/components/version-history.tsx`
2. `src/features/documents/components/version-history.test.tsx`

Sin barrel. Disjunto de `MVP-112`. **Prohibido:** igual que [snapshot-presentation](snapshot-presentation.md) (contratos, mocks, preview, UI compartida, rutas, containers, CSS, paquetes, config, CI, `.env*`).

## Aceptación

- [ ] «Versión finalizada; sello pendiente» y «registrado» se leen distinto y no se funden; nunca «sellada» sin `registrado`.
- [ ] Un sello `fallido` aparece como sello pendiente con la versión finalizada.
- [ ] v1 conserva su estado al mostrar v2; el sello de v1 no se atribuye a un borrador v2.
- [ ] Seleccionar solo llama `onSelect(versionId)`; sin botones de editar, regenerar ni reintentar sello.
- [ ] Vacío, carga y error diferenciados; texto como contenido.
- [ ] Teclado, foco visible, estado seleccionado anunciado por texto; sin desbordamiento a 360 px.
- [ ] Sin expresiones prohibidas; sin afirmar integridad o verdad.
- [ ] Tests de escenarios, selección y negativos.
- [ ] Capturas a 360 y 1280 px: varias versiones, sello pendiente, registrado, vacío, error.

## Resolución de preparación

MVP-110 completada; wireframe técnico aceptado y ticket asignado a Facu. La excepción autorizada permitió editar exclusivamente import/entrada propia del registro, su prueba y casos E2E, con un único escritor. Historial real conectado al preview; no acredita persistencia ni MVP-116.

## Validación y entrega

Igual que [snapshot-presentation](snapshot-presentation.md#validación-y-entrega).

# Ficha de delegación: presentación del snapshot y advertencias (MVP-112)

**Estado: contrato y escenarios disponibles (probados con Vitest); borrador local sin Issue ni asignación.** Pendientes: referencia visual y publicación del Issue (ver «Huecos»). Formato y reglas comunes: [dashboard-presentation](dashboard-presentation.md), [frontend-delivery](../specs/frontend-delivery.md) (§2–§5, F-02, F-06, F-07) y [plan de tickets](../exec-plans/active/mvp/f11-frontend-presentation-tickets.md).

## Objetivo

Mostrar en solo lectura el contenido completo de operación congelado y sus advertencias materiales con fuentes como alias descriptivos, con control documental, confirmaciones, finalización y sello como estados separados. Sin acciones de confirmar, rechazar, congelar ni finalizar (esas son de `MVP-077`/`MVP-076`).

Referencias: PRD REQ-08, REQ-12/13 (contenido idéntico), INV-02, INV-11, INV-14, INV-17, §5, §10, §11; [SH-02, SH-03](../design/mvp-shared-foundations.md).

## Contrato y alcance

- Props (existen): `SnapshotViewProps { state: SnapshotViewState; onRetry }` en `src/features/documents/contracts/snapshot-view.ts`. Estado: `SnapshotViewState` / `SnapshotViewStateSchema` en `src/lib/contracts/snapshot-view.ts` (`loading` · `error{message}` · `empty` · `ready{revisionId, snapshotId, content: FrozenOperation, documentStatus, controlStatus, confirmationStatus, hcsStatus}`). Advertencias con fuentes como **alias** (`SharedWarning`/`SourceAlias`, `src/lib/contracts/review.ts`). El colaborador no los edita.
- Escenarios (existen): `snapshotScenarios` en `src/mocks/documents.ts` — `loading`, `error`, `empty`, `critical-two-sources`, `unit-missing`, `no-warnings`, `long-content`. Se abren en `npm run preview:ui` → componente «Snapshot (placeholder, MVP-112)» (hoy vuelca JSON; el líder cambiará la entrada para renderizar tu componente).

**Allowlist propuesta (a confirmar en el Issue):**

1. `src/features/documents/components/snapshot-view.tsx`
2. `src/features/documents/components/snapshot-view.test.tsx`

Sin barrel `index`. Disjunto de `MVP-113`. Fixtures locales solo si el ticket los autoriza en `src/features/documents/fixtures/`; por defecto se consumen los escenarios del líder en `src/mocks/`.

**Prohibido:** `src/lib/contracts/`, `src/mocks/`, `preview/`, `src/components/ui/`, `src/hooks/`, `src/app/`, containers, CSS global, `package.json`/lockfile, configuración, CI, `.github/`, migraciones, `.env*`. Sin `next/*`, SDK, red ni `process`. Si falta algo, pedir ampliación al líder.

## Aceptación

- [ ] Todos los escenarios renderizan; carga, vacío y error se distinguen.
- [ ] Contenido completo, sin truncar significado; texto como contenido, nunca HTML arbitrario.
- [ ] Contradicción crítica con **ambas fuentes visibles** sin colapsar; severidad indicada por texto, no solo color.
- [ ] Estados de documento, control, confirmaciones y sello separados; confirmación `null` = ausencia de revisión; «sin inconsistencias críticas detectadas» no se lee como «corroborado».
- [ ] Sin botones de confirmar, rechazar, congelar ni finalizar; una advertencia crítica no deshabilita nada.
- [ ] No se muestran ni piden IDs internos, rutas ni enlaces autorizantes.
- [ ] Sin las expresiones prohibidas (PRD §5, §11).
- [ ] Teclado, foco visible, nombres accesibles; sin desbordamiento horizontal a 360 px; legible a 1280 px.
- [ ] Tests de escenarios y casos negativos (crítica con acciones no deshabilitadas; fuente ausente).
- [ ] Capturas a 360 y 1280 px: ready con crítica y dos fuentes, sin advertencias, unidad no informada, vacío, carga y error.

## Huecos (qué impide delegar hoy)

1. Contrato y escenarios ya existen (ver arriba). Falta que el líder conecte la entrada del preview a tu componente al integrarlo.
2. Cierre formal de `MVP-110` y del Issue: pendiente.
3. Referencia visual / acabado para esta entrega: no fijada.
4. Asignación y handle de quien ejecute: ver [índice](README.md).

## Validación y entrega

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`; `npm run build` y `npm run test:e2e` si hay interacción/preview. Resultados reales en el PR. Un test fallido no sensible que no impide el recorrido puede mergearse con advertencia visible en el PR y aviso a quien ejecuta; nada que toque secretos, permisos, datos o finalización sin confirmaciones se mergea (AGENTS.md). Las capturas del preview no acreditan integración.

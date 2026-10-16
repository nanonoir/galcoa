# Ficha de delegación: presentación del dashboard

**Estado: borrador local para convertir en Issue; no asignado ni publicado.** Requiere completar y validar la [preparación del equipo](../exec-plans/completed/team-workspace-readiness.md). No autoriza por sí mismo comenzar una tarea ni modificar archivos fuera de su alcance.

## Objetivo

Convertir la referencia mínima del preview en una presentación clara y responsive del historial de documentos. Reutilizar el tema y shadcn existentes; no crear sesión, CRUD, servicios, endpoints ni reglas de negocio.

Referencias: [PRD REQ-02 y estados §5](../exec-plans/GALCOA-PRD-v1.4.md), [arquitectura](../architecture.md), [desarrollo](../development.md). No requiere un diseño técnico adicional: respeta los contratos existentes. La referencia mínima existente y las pautas visuales del [paquete](README.md#referencia-visual-wireframe-textual-propuesta-técnica-local) son la base de acabado.

## Contrato y alcance

- Props: `DashboardViewProps` en `src/features/dashboard/contracts/dashboard-view.ts`.
- DTO: `DashboardViewStateSchema` en `src/lib/contracts/dashboard.ts` y `DocumentSummarySchema` en `src/lib/contracts/document.ts`.
- Escenarios: `dashboardScenarios` en `src/mocks/dashboard.ts`.
- Acciones: `onCreate`, `onOpen(documentId)` y `onRetry`. Son callbacks provistos; no hacer peticiones ni persistir.

**Allowlist propuesta, a confirmar en el Issue:**

1. `src/features/dashboard/components/dashboard-reference.tsx`.
2. `src/features/dashboard/components/dashboard-reference.test.tsx`.

Conservar nombre/exportación y props usados por el preview. No modificar contratos, mocks compartidos, preview/config, componentes UI compartidos, CSS global, rutas, manifests o lockfile. Si se necesita otro archivo, solicitar ampliación al líder antes de editarlo.

## Aceptación

- [ ] Renderizar escenarios `loading`, `error`, `empty`, `commercial`, `measurement`, `confirmations`, `finalized-pending` y `finalized-registered`.
- [ ] Diferenciar carga, vacío y fallo recuperable; no anunciar éxito de una acción real a partir del callback local.
- [ ] Mostrar título, fechas y dimensiones de estado sin mezclar finalización, confirmaciones y sello HCS. Confirmación `null` se representa como ausencia de revisión, no como confirmación completa.
- [ ] Conservar advertencias materiales y sus fuentes, sin ocultar contradicciones ni deshabilitar acciones por ellas. No afirmar verdad, identidad verificada o certificación.
- [ ] Crear, abrir y reintentar llaman únicamente al callback correcto. Renderizar texto como contenido, no HTML arbitrario.
- [ ] Navegación con teclado, nombres accesibles y foco visible; sin desbordamiento horizontal a 360 px y presentación legible a 1280 px.
- [ ] Tests de estados y callbacks, incluidos error/vacío y advertencia crítica no bloqueante.
- [ ] Capturas a 360 y 1280 px, incluyendo lista, vacío y error; indicar el escenario usado.

## Validación y entrega

`npm ci`, `npm run preview:ui`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build` y `npm run test:e2e`. No requiere `.env` ni acceso a proveedores.

Usar rama desde `origin/develop` actualizado, PR vinculado al Issue cuando se cree, resumen de cambios y evidencia real. Claude hace commit, push, PR y merge con la autonomía y las reglas de fallos de `AGENTS.md`; no necesita una aprobación humana obligatoria. Las capturas del preview no acreditan integración con el backend ni permisos sobre documentos reales.

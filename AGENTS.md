# GALCOA+ — instrucciones para agentes

Aplicación única Next.js 16 (App Router) para documentar operaciones por chat, con confirmaciones y sello de huella en Hedera HCS (Testnet). Documentación en español.

Estas instrucciones se aplican con cualquier herramienta de desarrollo. No requieren un harness, skills, subagentes ni comandos especiales. Para personas, el punto de entrada es el [`README.md`](README.md). Respeta además las reglas de seguridad y permisos de tu herramienta.

## Fuente de verdad y precedencia

1. Instrucciones explícitas del usuario o del ticket asignado.
2. [`docs/exec-plans/GALCOA-PRD-v1.4.md`](docs/exec-plans/GALCOA-PRD-v1.4.md): PRD de producto (v1.5 internamente; el nombre del archivo se conserva a propósito, no lo renombres ni lo muevas).
3. Este archivo y las guías de [`docs/`](docs/README.md).
4. El código existente. Si código y PRD discrepan, investiga la intención antes de cambiar uno u otro y repórtalo.

No inventes requisitos de producto. Resuelve decisiones técnicas locales compatibles con el PRD y documenta las relevantes; consulta cuando cambien el comportamiento de producto, la seguridad o contratos compartidos importantes.

## Inicio rápido y flujo de trabajo

1. Lee estas instrucciones y solo las secciones del PRD y guías relevantes para la tarea.
2. Revisa el código, la configuración y los cambios existentes; preserva trabajo ajeno.
3. Delimita el objetivo a partir del pedido o ticket y realiza los cambios necesarios, sin refactorizaciones ajenas.
4. Ejecuta las validaciones proporcionales disponibles y revisa el diff.
5. Informa cambios, resultados comprobados y pendientes; no declares checks que no ejecutaste.

Puedes trabajar directamente a partir de un pedido: no hace falta crear un Issue para empezar. Si existe un ticket con carpetas autorizadas o contratos, respétalos (PRD §13–14).

## Alcance y estado

- Alcance: **P0** del PRD (§4, REQ-01…REQ-18). P1 (§4, §15), Mainnet, pagos (Mercado Pago/Stripe) y envío automático de invitaciones están **fuera de P0**.
- Estado actual: plantilla Next + shadcn, contratos/escenarios de dashboard y herramientas de presentación/tests. No hay auth, base de datos, IA, PDF ni Hedera implementados. No confundas preview o tests con integraciones reales; ver [`docs/architecture.md`](docs/architecture.md).
- El PRD no fija orden de trabajo (§13–14). La tarea asignada delimita el alcance.

## Reglas de producto que más afectan al código

Estas reglas son obligatorias; detalle y justificación en PRD §3, §5 y §6. Referencia sus IDs en lugar de mantener especificaciones paralelas; el código y los tests deben implementarlas y verificarlas.

- Autonomía máxima: dudas, omisiones y contradicciones son **advertencias no bloqueantes**, incluso las críticas (INV-02, INV-10). Solo bloquean impedimentos técnicos, de seguridad, permisos o confirmaciones faltantes.
- Todos los participantes seleccionados confirman la **misma revisión y snapshot** congelados antes de generar PDF/anexo/HCS (INV-11, INV-14, INV-17). Un cambio material o de selección crea otra revisión sin heredar confirmaciones.
- Rechazo: casilla desmarcada + modal de ratificación; impide finalizar esa revisión (INV-13). GET nunca consume el token; respuesta y consumo son atómicos e idempotentes (INV-12, INV-13).
- Versiones finalizadas, PDFs, hashes y reportes son **inmutables** (INV-05, INV-18).
- Hedera solo **Testnet**; a HCS solo hashes e identificadores opacos (INV-06). Los agentes no reciben herramientas de envío a blockchain (INV-04).
- Lenguaje: no usar «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» ni «identidad verificada» para lo que produce el sistema (PRD §5, §11).

## Convenciones del repositorio

- Se conserva `src/`; el árbol del PRD §13 es **orientativo**, no ordena mover código (D-17). Alias `@/*` → `src/*`.
- `src/components/ui/`: componentes shadcn (`base-nova`, configurado en `components.json`); prefiere la CLI para incorporar componentes. Se permiten cambios manuales coherentes con el estilo, la accesibilidad y las APIs existentes.
- Helpers en `src/lib/`, hooks en `src/hooks/`. Crea carpetas del árbol orientativo solo cuando la tarea las necesite.
- Presentación delegada en `src/features/<dominio>/components/`, tests y fixtures locales **solo según la allowlist del ticket**. Contratos, containers, mocks compartidos, rutas, primitivas UI, estilos y configuración son del líder salvo autorización. Sigue las barreras de imports de arquitectura; no introduzcas red, SDK ni entorno en presentación.
- Gestor: **npm** (`package-lock.json` versionado). No agregues Redis, colas, microservicios, email externo ni pagos en P0.
- Antes de escribir código Next.js, lee la guía correspondiente en `node_modules/next/dist/docs/` (ver bloque al final).

## Autorización y seguridad

- Puedes implementar cambios en las áreas necesarias para la tarea solicitada, incluidas las integraciones si están expresamente dentro de su alcance. Coordina con el líder técnico cambios incompatibles en contratos compartidos, migraciones destructivas, nuevos servicios externos o cambios de alcance; no amplíes por iniciativa propia la configuración global, Auth/RLS, API o Hedera (PRD §13).
- **No leas ni imprimas** `.env`, `.env.local` ni valores de secretos. Los nombres de variables están en `.env.example`. Solo `NEXT_PUBLIC_*` pueden llegar al cliente.
- Claves de Supabase (secret), proveedores de IA y Hedera: solo servidor. Nunca en logs, commits, docs ni fixtures.
- No ejecutes llamadas reales a Hedera, Supabase o proveedores de IA con credenciales salvo que el pedido o ticket lo autorice expresamente. Datos de prueba ficticios.
- No hagas commit, push ni merge salvo pedido explícito; el líder técnico integra.

## Checks reales

Scripts de validación en `package.json`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build` y `npm run test:e2e`. Vitest cubre contratos/componentes; Playwright cubre navegador. `preview:ui` es solo desarrollo local sin credenciales. CI está definido en `.github/workflows/ci.yml`; no presupongas que corrió en GitHub ni que hay branch protection activa. Qué correr según el cambio: [`docs/development.md`](docs/development.md).

Comprueba `package.json` y el código al comenzar: este inventario puede cambiar. Para cambios riesgosos, se recomienda revisión independiente cuando esté disponible; si no, realiza una autorrevisión explícita y declara sus límites. No requiere un subagente ni un servicio concreto.

## Documentación progresiva

| Necesitas… | Lee |
| --- | --- |
| Qué construir y reglas | [PRD](docs/exec-plans/GALCOA-PRD-v1.4.md) (secciones citadas arriba) |
| Estructura actual vs. objetivo | [`docs/architecture.md`](docs/architecture.md) |
| Comandos, validación, secretos | [`docs/development.md`](docs/development.md) |
| Deuda conocida | [`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md) |
| Seguimiento del MVP | [Plan maestro](docs/exec-plans/active/mvp-master-plan.md): actualiza solo las filas de tus IDs `MVP-NNN`, con evidencia real |
| Planes de trabajo | `docs/exec-plans/active/` (abiertos) y `docs/exec-plans/completed/` |

Para cambios importantes de comportamiento, arquitectura o integraciones, registra primero objetivo, pasos y validación en un ExecPlan en `docs/exec-plans/active/`; actualízalo durante el trabajo y archívalo en `completed/` al cerrar. Puedes hacerlo directamente, sin herramientas ni agentes especializados. Los ajustes pequeños de presentación o mantenimiento no requieren un plan. No hay una secuencia obligatoria de especificación → diseño → plan: crea solo los documentos que la tarea necesite.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

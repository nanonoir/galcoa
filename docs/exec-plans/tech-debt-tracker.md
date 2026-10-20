# Technical Debt Tracker

## Open Technical Debt

### 1. Dev-only audit vulnerabilities in `braces` via `fast-glob`

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/lint-types-audit-hardening.md`
- **Severity**: High (dev-only; 9 advisories)
- **Description**: `npm audit` reports 9 high-severity vulnerabilities rooted in transitive dependency `braces` (latest published version 3.0.3 remains vulnerable) via `fast-glob`, pulled in exclusively by development packages used for build, linting, and tooling (`shadcn`, `ts-morph`, `@next/eslint-plugin-next`).
- **Impact**: Zero production impact on client bundles or production runtime artifacts (`npm audit --omit=dev` reports 0 vulnerabilities). However, audit metrics are not treated as an absolute proof of security, as vulnerable code exists in the development tooling tree.
- **Current State**: Blocked upstream. No compatible patched versions of `braces` or consumers (`fast-glob`) have been released. Applying `npm audit fix --force` was rejected as it forces major breaking downgrades (`hedera-agent-kit@4.0.0`, `shadcn@1.0.0`, `eslint-config-next@14`).
- **Remediation**: Monitor upstream updates to `braces`, `fast-glob`, `shadcn`, and Next.js ESLint plugin. Update dependencies once a non-breaking upstream patch is available.

### 2. Integration testing for Hedera and OAuth under overridden dependencies

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/lint-types-audit-hardening.md`
- **Severity**: Low / Verification gap
- **Description**: Local smoke testing verified basic runtime compatibility (ethers `WebSocketProvider` roundtrip over local WS server, MCP `InMemoryTransport` `tools/list`, and Hedera SDK package import). In `team-workspace-readiness.md` (P1), unused packages `@hashgraph/hedera-agent-kit` and `@hashgraph/hedera-agent-kit-ai-sdk` were removed from `package.json`, reducing the unverified dependency surface. However, real network integration with Hedera Testnet nodes using live credentials (`@hiero-ledger/sdk`) and live OAuth authentication flows remain unexecuted.
- **Impact**: Potential edge-case incompatibilities in live network calls or credentialed authentication remain unverified by automated tests.
- **Current State**: Static types and local mock transports pass. No live credentials or network test environments were configured during readiness preparation.
- **Remediation**: Execute end-to-end integration tests with live Hedera testnet credentials and real OAuth provider configs when integration test harness is in place.

### 3. Dependencias y variables de entorno desviadas del PRD

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md` (actualizado en `team-workspace-readiness.md`)
- **Severity**: Low (alineación de producto; sin impacto en runtime ni bloqueo de presentación)
- **Description**: Frente al stack del PRD (§0, §13): se incorporó `zod@4.6.7` y se retiraron las dependencias no utilizadas en P0 (`@ai-sdk/groq`, `@hashgraph/hedera-agent-kit`, `@hashgraph/hedera-agent-kit-ai-sdk`, `mercadopago`, `stripe`). `.env.example` se versionó con los nombres canónicos de variables del PRD §13 (`HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, etc.), vacío salvo `HEDERA_NETWORK=testnet`. Posteriormente, por decisión del líder en [`deps-ai-sdk-server-only`](completed/deps-ai-sdk-server-only.md), se instalaron `ai`, `@ai-sdk/react`, `groq-sdk` y `server-only` por ser requeridas por los planes `MVP-040…`/`05x`; siguen sin consumidores ni integración implementada.
- **Impact**: Superficie de dependencias acotada para el desarrollo frontend; consumidores de IA pendientes de integración con sus dependencias reales en backend.
- **Current State**: Dependencias de IA alineadas con el PRD (`ai`, `@ai-sdk/react`, `groq-sdk`, `@ai-sdk/google`) y `server-only` instalados; sin consumidores todavía. `.env.example` y Zod alineados. Pendiente: librería de QR (PD-03 de `MVP-078`, decisión del líder, no instalada) y verificar `npm audit` al integrar cada consumidor.
- **Remediation**: Cada plan consumidor (`MVP-050…`, `MVP-078`) valida su integración real y la auditoría; esta deuda no se cierra por instalar paquetes.

### 5. Cobertura de tests de negocio y suites completas de servidor/RLS (CI base Linux remoto verificado)

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md` (actualizado en `team-workspace-readiness.md`, `mvp-planning-pack.md` y `f00-integracion-base-ci.md`)
- **Severity**: Medium (REQ-18)
- **Description**: La infraestructura de tooling, runner y CI base se completó y verificó en GitHub Actions sobre Linux en `MVP-006` (runs 38883794710 y 38883996495). El [harness MVP-120](completed/f12-server-test-harness.md) quedó integrado por PR #79 con servidor/Auth/RLS locales reales. [MVP-131](active/mvp/f13-release-security-and-ci.md) amplió CI servidor/RLS por PR #83 (`560edf7`) con [run Linux 38954022116](https://github.com/nanonoir/galcoa/actions/runs/38954022116) SUCCESS. Sigue pendiente completar la cobertura de negocio/REQ-18 y su matriz (`MVP-121`); la protección de ramas es opcional posthackathon.
- **Impact**: La base de CI y verificación estática/browser está operativa y comprobada remotamente en Linux; la cobertura de las reglas de negocio e integridad de persistencia/RLS se incorporará conforme se desarrolle el backend.
- **Current State**: Parcialmente resuelto. CI base Linux (`MVP-006`), harness local (`MVP-120`) y CI ampliado (`MVP-131`) completados. Ambos jobs de CI y limpieza comprobados; revisión independiente sin bloqueantes. Esto no acredita REQ-18 completo, la matriz `MVP-121` ni el transporte HTTP Next íntegro de `MVP-134`. La protección de ramas es opcional posthackathon.
- **Remediation**: Completar la matriz y suites de negocio con cada feature backend (`MVP-121`) y validar el transporte íntegro en `MVP-134`; conservar las suites servidor/RLS ya integradas en CI.

### 6. Aviso de compatibilidad ESM en configs TypeScript de Vite/Vitest

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/team-workspace-readiness.md`
- **Severity**: Low (informativo / tooling)
- **Description**: Node y Vite emiten un aviso informativo no bloqueante al cargar configuraciones TypeScript (`preview/vite.config.ts`, `vitest.config.ts`) sobre la futura compatibilidad del loader nativo ESM en Node.
- **Impact**: Ninguno en runtime ni en build; las suites de tests y el preview funcionan completamente sin fallos.
- **Current State**: Se conserva el comportamiento por defecto sin añadir flags globales frágiles en `package.json` ni silenciar artificialmente el aviso.
- **Remediation**: Monitorear actualizaciones de Vite y Vitest que adopten la resolución nativa de configuraciones TS cuando esté estabilizada.

### 7. Discrepancia menor en extensión utils entre manifest y graph de barreras

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/team-workspace-readiness.md`
- **Severity**: Low / Mantenimiento
- **Description**: En `tests/boundaries/manifest.mjs` la lista de permitidos para presentación incluye `lib/utils.{ts,tsx}`, mientras que en `tests/boundaries/graph.ts` la comprobación explícita valida contra `src/lib/utils.ts`.
- **Impact**: Ninguno actualmente, ya que el archivo real es `src/lib/utils.ts`. Si en el futuro `utils.ts` se renombrara a `utils.tsx`, el check de grafo lo rechazaría mientras que la regla ESLint lo permitiría.
- **Current State**: Ambos checks pasan con el archivo existente `src/lib/utils.ts`.
- **Remediation**: Armonizar la comprobación en `graph.ts` para aceptar tanto `.ts` como `.tsx` en un pase posterior de mantenimiento de herramientas.

### 8. Limpieza residual de objetos de Storage abandonados sin SLA global ni cron de fondo

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/active/mvp/f04-evidence-upload-extraction.md` (PR #96, PR #97)
- **Severity**: Medium / Operativo
- **Description**: El protocolo de descarte irreversible (`claim_evidence_discard` + `Storage.remove` + `discard_evidence_reservation`, migración `20261016002300_evidence_discard_protocol.sql`) asegura que una reserva vencida o rechazada retiene su cuota por documento y no se acepta mientras esté pendiente de limpieza. La recuperación de objetos abandonados es oportunista y se ejecuta únicamente en el contexto de nuevas reservas del mismo propietario (en lotes de hasta 3 reservas candidatas). No existe un proceso en segundo plano (cron/worker/job) ni SLA que garantice un plazo máximo de eliminación física de objetos huérfanos si el usuario no realiza nuevas operaciones, ni existe un límite físico acumulado global en el bucket a nivel infraestructura. Asimismo, la prueba HTTP de subida concurrente demuestra que el claim aborta la adopción y descarga del objeto, pero no prueba por sí sola el instante exacto del preflight de Storage ni la recolección física inmediata en el almacenamiento del proveedor.
- **Impact**: Si un usuario sube un archivo y abandona la reserva sin volver a interactuar con el sistema, el objeto binario permanece en el bucket de Storage sin exceder la cuota documental del usuario pero consumiendo almacenamiento físico en Supabase hasta que el propietario genere una nueva reserva.
- **Current State**: Parcialmente mitigado a nivel lógico y por propietario: las reservas vencidas no liberan cupo automáticamente, el claim irreversible previene la aceptación/adopción indebida, y la siguiente reserva del propietario limpia hasta 3 abandonos previos. CI run `38990325702` verificó los escenarios en base local.
- **Remediation**: Para producción (post-hackathon / P1), implementar un cron seguro o función administrativa programada (e.g. pg_cron o edge function con rol de servicio autenticado) que barra reservas reclamadas o vencidas abandonadas respetando el protocolo terminal de claim, y establecer alarmas de capacidad física del bucket.

### 9. Advertencias ocultas en todo el sistema para la demo del MVP

- **Discovered/Recorded**: 2026-10-17
- **Originating Plan**: `docs/exec-plans/active/mvp-demo-happy-path.md` (D1)
- **Severity**: High (desvío de producto aceptado explícitamente por el usuario)
- **Description**: Con `DEMO_HIDE_WARNINGS = true` (`src/lib/contracts/demo-mode.ts`) no se muestran advertencias, avisos de contraste ni estado de control en chat, snapshot, revisión, confirmación de terceros, dashboard ni PDF final, y el chat no invoca el contraste. Contradice PRD INV-02/INV-10 y §5 (advertencias visibles y registradas). Las advertencias del agente se siguen generando y persistiendo.
- **Impact**: Participantes confirman y se publican PDFs sin ver dudas, omisiones o contradicciones detectadas. Los PDFs finalizados con el flag activo no incluyen la sección de advertencias y son inmutables (INV-05/18).
- **Current State**: Activo para la demo.
- **Remediation**: Poner `DEMO_HIDE_WARNINGS = false` tras la demo, rediseñar la presentación de advertencias para que sea clara y menos ruidosa, y revisar los documentos finalizados durante la demo.

### 11. Límites de validación de infraestructura: Docker ausente para RLS local y ciclo autenticado cloud de nueva UI pendiente de despliegue

- **Discovered/Recorded**: 2026-10-20
- **Originating Plan**: `docs/exec-plans/completed/ui-ux-profesional.md`
- **Severity**: Low / Verificación y despliegue
- **Description**: La evolución profesional de UI/UX y la estabilización funcional quedaron completadas al 100% en local (101 archivos, 1444 tests, 69 barreras, lint, build con rutas dinámicas y 142/142 pruebas Playwright E2E pasando, con 7 revisiones independientes PASS). Sin embargo, persisten límites reales de entorno:
  1. **Docker ausente en la estación local:** impidió ejecutar las suites reales de migraciones SQL y aislamiento RLS contra PostgreSQL local (`npm run test:rls`), apoyándose la validación en dobles y pruebas de servidor.
  2. **Discrepancia de credenciales en Auth local:** la base de datos local no sincronizada/investigada no acepta las credenciales de la cuenta beta remota.
  3. **Nueva UI local pendiente de despliegue:** los componentes y mejoras de UI residen estrictamente en el entorno local (sin push a GitHub ni despliegue a Vercel, por quedar fuera del alcance autorizado); la validación del ciclo autenticado completo de la nueva UI contra la base de datos alojada en la nube se realizará al momento del despliegue autorizado.
- **Impact**: Cero impacto en el código y pruebas locales integradas. La verificación en nube de la nueva UI y la prueba de migraciones RLS con Docker se ejecutarán cuando se habilite el despliegue y un entorno con Docker activo.
- **Current State**: Abierto como seguimiento post-implementación / pre-despliegue.
- **Remediation**: 1) Levantar Docker en local para ejecutar `npm run test:rls` y el harness completo con base real. 2) Al autorizarse la entrega Git y el despliegue a Vercel, realizar la verificación funcional del recorrido autenticado de la nueva interfaz contra el entorno remoto.

### 12. Adaptación visual en Hero móvil: ilustración fuera de viewport al seleccionar etapas inferiores

- **Discovered/Recorded**: 2026-10-20
- **Originating Plan**: `docs/exec-plans/completed/movimiento-profesional.md`
- **Severity**: Low / UX Follow-up (no bloqueante)
- **Description**: En el hero interactivo de la landing (`src/features/marketing/components/hero-journey.tsx`), en viewports móviles estrechos (≤390px), la ilustración esquemática queda posicionada por encima de la lista de etapas. Al seleccionar etapas inferiores mediante toque, el feedback local (marcador y texto activo) responde inmediatamente, pero la ilustración queda fuera de la porción visible superior de la pantalla, requiriendo scroll manual del usuario para apreciar el diagrama esquemático actualizado. Adicionalmente, el plan cerró con videos y trazas en `%TEMP%/galcoa-motion` grabados pero no inspeccionados formalmente por video, sin métricas instrumentadas de CLS/LCP y con validación de áreas privadas limitada a componentes sin integración backend de red.
- **Impact**: Cero errores en consola, sin desborde horizontal y con accesibilidad plena por teclado y táctil. Experiencia visual perfectible en pantallas pequeñas.
- **Current State**: Comportamiento aceptado como seguimiento UX no bloqueante para el cierre de movimiento profesional.
- **Remediation**: En una iteración posterior de diseño responsive de marketing, evaluar reposicionar la ilustración debajo de cada etapa activa en pantallas estrechas o añadir anclaje suave accesible; e instrumentar métricas de CLS/LCP en la preparación de despliegue.

### 13. Clases `dark:` inertes de shadcn y límites de validación en paleta institucional

- **Discovered/Recorded**: 2026-10-20
- **Originating Plan**: `docs/exec-plans/completed/paleta-institucional.md`
- **Severity**: Low / Mantenimiento y verificación
- **Description**: Tras la consolidación de la paleta institucional azul noche (`:root` en `#0C1A2E`, sin selector de tema ni clase `.dark` activa):
  1. **Utilidades `dark:` inertes:** Diversos componentes derivados de shadcn conservan variantes `dark:*` que nunca se activan en runtime. No generan efectos colaterales ni regresiones visuales, pero representan código inerte fuera del alcance actual. No debe forzarse su limpieza inmediata.
  2. **Verificación visual de áreas privadas con sesión:** La inspección visual real se ejecutó sobre rutas públicas (landing, auth, verify, confirm) y mediante fixtures/pruebas unitarias para áreas privadas, sin recorrer el layout autenticado `(app)` con sesión real en navegador para no usar credenciales ni realizar operaciones remotas.
  3. **Medición en navegador de movimiento reducido y CWV:** La preferencia `prefers-reduced-motion` se validó a nivel CSS global y clases en tests unitarios, sin medición automatizada de renderizado en navegador, y sin métricas instrumentadas de Core Web Vitals en este lote.
- **Impact**: Cero fallas en runtime, suites de tests (1452 pruebas) y build exitoso.
- **Current State**: Comportamiento funcional y estético aceptado para el cierre de la paleta institucional.
- **Remediation**: 1) En un pase posterior de refactorización o mantenimiento de componentes UI, limpiar selectores `dark:` inertes si se decide simplificar el marcado. 2) Completar la inspección visual autenticada de rutas privadas en el ciclo de pruebas pre-despliegue. 3) Instrumentar métricas CWV y validación de movimiento reducido en el harness de despliegue.

---

## Resolved Technical Debt

### 4. `.env.example` ignorado por `.gitignore`

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md`
- **Resolution Plan**: `docs/exec-plans/completed/team-workspace-readiness.md`
- **Severity**: Low
- **Description**: El patrón `.env*` ignoraba también `.env.example`, que el README usa como referencia de nombres de variables; no se versionaba.
- **Resolution**: Resuelto en P1 de `team-workspace-readiness.md`. Se añadió la excepción `!.env.example` en `.gitignore`. Se generó y versionó una plantilla `.env.example` limpia con los nombres de variables de PRD §13, vacía salvo `HEDERA_NETWORK=testnet`. La plantilla local previa se preservó en `.env.example.local` (ignorado por Git) sin leer ni exponer ningún valor secreto.

### 10. Falla de persistencia 503 en renombrado remoto de documentos y migración faltante en Supabase alojado

- **Discovered/Recorded**: 2026-10-20
- **Originating Plan**: `docs/exec-plans/completed/ui-ux-profesional.md`
- **Resolution Plan**: `docs/exec-plans/completed/ui-ux-profesional.md`
- **Severity**: Medium / Operativo
- **Description**: Durante la auditoría en la beta remota, el cambio de título de documentos devolvió HTTP 503 `TECHNICAL_FAILURE` en etapa de persistencia (correlationId `924977c8-9f60-4a8f-9f7a-57f4fb0d4536`).
- **Resolution**: Resuelto el 2026-10-20. Con autorización previa y sesión CLI confirmada (`galcoa-dev` `yyvwuihzbdglidbxdknd`), el preflight de catálogo comprobó que la función `rename_document` y la migración `20261017000100` estaban ausentes en la base alojada. Tras revisión independiente PASS (sesión `ses_ea7cbf51cffepMkmrpLZ0fuKxc`), se aplicó exclusivamente `supabase/migrations/20261017000100_rename_document.sql` mediante consulta transaccional (advisory lock, guardas, historial exacto y recarga PostgREST; SHA256 coincidente `efe68d74fc1535ca4a67f1a8a51ccf4b11415aba9ef26d3dbb6ae538bf016afe`). Verificado en la beta productiva con cuenta existente: documento mutable renombrado y persistente tras recarga (1 evento de auditoría); renombrado idéntico 200 sin auditoría extra; intento sobre documento finalizado rechazado con 409 `DOCUMENT_FINALIZED`; sin cookies rechazado con 401 `NO_SESSION`; títulos, eventos y hash de manifiesto finalizado intactos.

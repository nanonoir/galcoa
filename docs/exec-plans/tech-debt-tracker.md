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
- **Description**: La infraestructura de tooling, runner y CI base se completó y verificó en GitHub Actions sobre Linux en `MVP-006` (runs 38883794710 y 38883996495). El [harness MVP-120](completed/f12-server-test-harness.md) quedó integrado por PR #79 con servidor/Auth/RLS locales reales. Sigue pendiente completar la cobertura de negocio/REQ-18 y su matriz (`MVP-121`), y ampliar CI servidor/RLS (`MVP-131`); la protección de ramas es opcional posthackathon.
- **Impact**: La base de CI y verificación estática/browser está operativa y comprobada remotamente en Linux; la cobertura de las reglas de negocio e integridad de persistencia/RLS se incorporará conforme se desarrolle el backend.
- **Current State**: Parcialmente resuelto. CI base Linux operativo (`MVP-006`) e infraestructura local `MVP-120` completada, con evidencia en su plan archivado. Esto no acredita REQ-18 completo, la matriz `MVP-121`, CI ampliado `MVP-131` ni el transporte HTTP Next íntegro de `MVP-134`. La protección de ramas es opcional posthackathon.
- **Remediation**: Desarrollar suites de pruebas de negocio con cada feature backend e integrar los tests de servidor/RLS en el CI ampliado (`MVP-131`).

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

---

## Resolved Technical Debt

### 4. `.env.example` ignorado por `.gitignore`

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md`
- **Resolution Plan**: `docs/exec-plans/completed/team-workspace-readiness.md`
- **Severity**: Low
- **Description**: El patrón `.env*` ignoraba también `.env.example`, que el README usa como referencia de nombres de variables; no se versionaba.
- **Resolution**: Resuelto en P1 de `team-workspace-readiness.md`. Se añadió la excepción `!.env.example` en `.gitignore`. Se generó y versionó una plantilla `.env.example` limpia con los nombres de variables de PRD §13, vacía salvo `HEDERA_NETWORK=testnet`. La plantilla local previa se preservó en `.env.example.local` (ignorado por Git) sin leer ni exponer ningún valor secreto.

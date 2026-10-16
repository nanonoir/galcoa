# Technical Debt Tracker

## Open Technical Debt

### 1. Dev-only audit vulnerabilities in `braces` via `fast-glob`

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/lint-types-audit-hardening.md`
- **Severity**: High (dev-only; 9 advisories)
- **Description**: `npm audit` reports 9 high-severity vulnerabilities rooted in transitive dependency `braces` (latest published version 3.0.3 remains vulnerable) via `fast-glob`, pulled in by development dependencies (`shadcn`, `ts-morph`, `@next/eslint-plugin-next`).
- **Impact**: Zero production impact (`npm audit --omit=dev` reports 0 vulnerabilities).
- **Current State**: Blocked upstream. No compatible patched versions of `braces` or consumers (`fast-glob`) have been released. Applying `npm audit fix --force` was rejected as it forces major breaking downgrades (`hedera-agent-kit@4.0.0`, `shadcn@1.0.0`, `eslint-config-next@14`).
- **Remediation**: Monitor upstream updates to `braces`, `fast-glob`, `shadcn`, and Next.js ESLint plugin. Update dependencies once a non-breaking upstream patch is available.

### 2. Integration testing for Hedera and OAuth under overridden dependencies

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/lint-types-audit-hardening.md`
- **Severity**: Low / Verification gap
- **Description**: Local smoke testing verified basic runtime compatibility (ethers `WebSocketProvider` roundtrip over local WS server, MCP `InMemoryTransport` `tools/list`, and Hedera SDK package import). However, real network integration with Hedera nodes using credentials and live OAuth flows were not executed during this change.
- **Impact**: Potential edge-case incompatibilities in live network calls or credentialed authentication remain unverified by automated tests.
- **Current State**: Static types and local mock transports pass. No live credentials/test environments were configured for this task.
- **Remediation**: Execute end-to-end integration tests with live Hedera testnet credentials and real OAuth provider configs when integration test harness is in place.

### 3. Dependencias y variables de entorno desviadas del PRD

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md`
- **Severity**: Medium (alineación de producto; sin impacto en runtime hoy, no hay código que las use)
- **Description**: Frente al stack del PRD (§0, §13): faltan `ai`, `@ai-sdk/react`, `groq-sdk` y `zod`; existe `@ai-sdk/groq` en lugar de `groq-sdk`. `package.json` incluye además `@hashgraph/hedera-agent-kit` y `@hashgraph/hedera-agent-kit-ai-sdk` así como `mercadopago` y `stripe`, que son dependencias por revisar / no usadas en P0 (su instalación sola no viola invariantes; el riesgo radicaría únicamente en exponer herramientas a los agentes frente a INV-04), y `react-hook-form`/`@hookform/resolvers`/`react-dropzone`/`sonner`/`date-fns`, no listados en el PRD (`cn` está en uso exportado en `src/lib/utils.ts`, por lo que no es un duplicado comprobado ni una discrepancia con el PRD). `.env.example` incluye `OPENAI_API_KEY` y `AI_*_PROVIDER` (el PRD fija Gemini + Groq) y usa `HEDERA_OPERATOR_ID`/`HEDERA_OPERATOR_KEY` donde el PRD §13 orienta `HEDERA_ACCOUNT_ID`/`HEDERA_PRIVATE_KEY` (el PRD indica verificar el nombre exacto en la implementación).
- **Impact**: Riesgo de que agentes o tickets adopten herramientas o proveedores no decididos si se exponen; superficie de dependencias mayor a la necesaria en P0.
- **Current State**: Sin modificar. Solo documentado.
- **Remediation**: El líder técnico decide por ticket qué dependencias se conservan, eliminan o agregan, y fija los nombres definitivos de variables.

### 4. `.env.example` ignorado por `.gitignore`

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md`
- **Severity**: Low
- **Description**: El patrón `.env*` ignora también `.env.example`, que el README usa como referencia de nombres de variables; no se versiona.
- **Impact**: Quien clone el repositorio no tendrá la plantilla.
- **Current State**: Sin modificar (`.gitignore` fuera de alcance).
- **Remediation**: Añadir excepción `!.env.example` en `.gitignore` por ticket, tras confirmar que no contiene valores reales.

### 5. Sin tests ni CI

- **Discovered/Recorded**: 2026-10-16
- **Originating Plan**: `docs/exec-plans/completed/docs-initialization.md`
- **Severity**: Medium (REQ-18)
- **Description**: No hay runner de tests, script `test` ni CI; el PRD §12–13 exige tests deterministas y checks por PR.
- **Impact**: Sin verificación automática del flujo crítico.
- **Current State**: Solo `lint`, `typecheck` y `build` manuales.
- **Remediation**: Introducir runner y CI mediante ticket, y actualizar `docs/development.md`.

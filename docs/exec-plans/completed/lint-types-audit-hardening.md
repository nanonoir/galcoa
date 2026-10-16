# ExecPlan: lint, typecheck and dependency audit hardening

Status: completed

## Objective

Leave `lint`, types, `build` and `npm audit` in a healthy state without disabling rules or using `npm audit fix --force`.

## Scope

1. Fix `react-hooks/set-state-in-effect` in `src/hooks/use-mobile.ts` preserving SSR (server and first client render return `false`) and behavior.
2. Add a `typecheck` script (`tsc --noEmit`).
3. Resolve audit findings with compatible updates; use `overrides` only when validated by build/lint/types.
4. Decide whether `shadcn` stays in `dependencies`, moves to `devDependencies`, or is removed.

## Baseline (2026-10-16)

- eslint: 1 error (`use-mobile.ts:14`). `tsc --noEmit` passes.
- `npm audit`: 15 packages (12 high, 3 moderate).
- Roots: `@modelcontextprotocol/sdk` 1.12.0-1.30.1 (via `hedera-agent-kit-ai-sdk`), `ws` 8.0.0-8.20.1 (via `ethers` via `@hiero-ledger/sdk`), `braces` (no patched version published; via `micromatch`/`fast-glob`/`ts-morph` from `shadcn`).
- npm's suggested fixes are major downgrades (`hedera-agent-kit@4.0.0`, `shadcn@1.0.0`, `eslint-config-next@14`); rejected.

## Decisions

- `shadcn` is only used at build time (`@import "shadcn/tailwind.css"` in `globals.css`, `components.json` for the CLI). It cannot be removed; it moves to `devDependencies`.
- `overrides`: `ws` -> `^8.22.0`, `@modelcontextprotocol/sdk` -> `^1.32.1`.
- `braces` has no patched release: remaining finding is documented, not worked around.

## Progress

- [x] Baseline gathered
- [x] Hook fix (`useSyncExternalStore`, SSR false, no disabled rules)
- [x] `typecheck` script (`tsc --noEmit`)
- [x] Dependency changes + lockfile (`shadcn` to dev, overrides for `ws` and `@modelcontextprotocol/sdk`)
- [x] Validation (lint, typecheck, build, audit)
- [x] Local runtime smoke checks (ethers WebSocketProvider, MCP InMemoryTransport, package loading)
- [x] Technical debt and pending items recorded

## Validation log

- eslint: 0 errors. `npm run typecheck`: pass. `npm run build`: pass.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm audit` (all): 9 high, all dev-only, rooted in `braces` (no patched release) via `fast-glob` <- `shadcn`/`ts-morph`/`@next/eslint-plugin-next`. npm only offers major downgrades; not applied.
- Residual: re-check when `braces` publishes a fix or `shadcn`/`eslint-config-next` drop `fast-glob`.

### Follow-up: runtime smoke of overrides and audit re-evaluation (2026-10-16)

Local smoke (throwaway script outside the repo, loopback only, no external network), run from the repo:
- `ws@8.22.0`: local `WebSocketServer` + `ethers` 6.17.0 `WebSocketProvider` JSON-RPC roundtrip (`eth_chainId` -> `0x1`) OK.
- `@modelcontextprotocol/sdk@1.32.1`: `Client` + `Server` over `InMemoryTransport`, `tools/list` OK.
- `@hashgraph/hedera-agent-kit-ai-sdk`, `@hashgraph/hedera-agent-kit`, `@hiero-ledger/sdk` load without errors. `shadcn --version` runs.
- No concrete failure found; no code changes needed.

Audit re-evaluation: latest published `braces` 3.0.3, `micromatch` 4.0.8, `fast-glob` 3.3.3, `@next/eslint-plugin-next`/`eslint-config-next` 16.4.2, `@shadcn/registry` 0.1.4 are all already installed and still flagged. `shadcn@4.21.5` is latest. Only a newer `ts-morph` (28) escapes its advisory, but `braces`/`fast-glob` stay through other paths, and overriding a major inside shadcn would be unvalidated. **Blocked upstream**: no safe compatible fix; the 9 dev-only findings remain documented, not hidden.

## Implementation Outcome

### Implemented

- Refactored `src/hooks/use-mobile.ts` using `React.useSyncExternalStore` with `getServerSnapshot` returning `false` for SSR safety and `getSnapshot` inspecting `window.innerWidth`. The ESLint error `react-hooks/set-state-in-effect` was resolved cleanly without disabling or suppressing lint rules.
- Added `typecheck` script (`"typecheck": "tsc --noEmit"`) to `package.json`.
- Moved `shadcn` to `devDependencies` because it is only required for the Tailwind CSS build import and CLI generators, leaving runtime production bundles clean.
- Configured npm `overrides` for `@modelcontextprotocol/sdk` (`^1.32.1`) and `ws` (`^8.22.0`), resolving all production audit vulnerabilities. Lockfile was regenerated and verified.

### Deviations from Design

None. The implementation followed the scoped decisions. As planned, no unvalidated major downgrades or force fixes were applied for `braces`.

### Validation

- Static analysis:
  - `npm run lint`: pass (0 errors, 0 warnings).
  - `npm run typecheck`: pass (clean type emit).
  - `npm run build`: pass (successful Next.js build).
- Security audit:
  - `npm audit --omit=dev`: 0 vulnerabilities.
  - `npm audit` (full): 9 high vulnerabilities remain in dev dependencies due to upstream unpatched `braces` via `fast-glob`.
- Local runtime smoke testing:
  - Verified `ws` override with `ethers` `WebSocketProvider` connecting to a local loopback WebSocket server and executing `eth_chainId` RPC roundtrip (`0x1`).
  - Verified `@modelcontextprotocol/sdk` override using `Client` and `Server` over `InMemoryTransport` executing `tools/list`.
  - Verified module imports and package initialization for `@hashgraph/hedera-agent-kit-ai-sdk`, `@hashgraph/hedera-agent-kit`, and `@hiero-ledger/sdk`.
  - Verified CLI execution of `shadcn --version`.
- Validation limitations and exclusions:
  - No real network integration tests were executed against Hedera testnet/mainnet using actual credentials.
  - No OAuth authentication flows were tested.
- Reviewer status:
  - Reviewer attempt was aborted per user instruction (implementer requested without reviewer); no independent review was completed.

### Follow-up

- Track upstream releases for `braces` / `fast-glob` / `shadcn` to resolve the 9 dev-dependency audit findings once compatible patches exist.
- Perform live Hedera network and OAuth integration testing when credentials and integration environments are established.

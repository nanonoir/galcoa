import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildTestBridge, BRIDGE_CACHE_ROOT, removeOwnDir, smokeImportBridge, type BridgeBuild } from "./build";
import { findBridgeViolations, type BridgeChunk } from "./guards";

const fixture = (name: string) => path.join(import.meta.dirname, "fixtures", name);
const built: BridgeBuild[] = [];

afterEach(() => {
  for (const bridge of built.splice(0)) bridge.cleanup();
});

describe("puente de test: build programático y smoke ESM", () => {
  it("genera un ESM aislado por ejecución que Node importa tal cual, con server-only resuelto", async () => {
    const first = await buildTestBridge({ entry: fixture("ok-entry.ts") });
    const second = await buildTestBridge({ entry: fixture("ok-entry.ts") });
    built.push(first, second);

    expect(first.dir).not.toBe(second.dir);
    expect(path.relative(BRIDGE_CACHE_ROOT, first.dir)).toBe(first.runId);
    const code = fs.readFileSync(first.file, "utf8");
    expect(code).not.toMatch(/server-only/);
    expect(smokeImportBridge(first)).toEqual(["composition"]);
  });

  it("el teardown elimina solo el directorio de su ejecución", async () => {
    const own = await buildTestBridge({ entry: fixture("ok-entry.ts") });
    const other = await buildTestBridge({ entry: fixture("ok-entry.ts") });
    built.push(other);

    own.cleanup();
    expect(fs.existsSync(own.dir)).toBe(false);
    expect(fs.existsSync(other.file)).toBe(true);
    expect(() => own.cleanup()).not.toThrow();
  });

  it("el teardown se niega a borrar fuera del caché del puente", () => {
    for (const target of [BRIDGE_CACHE_ROOT, path.resolve(BRIDGE_CACHE_ROOT, ".."), path.join(BRIDGE_CACHE_ROOT, "a", "b"), import.meta.dirname]) {
      expect(() => removeOwnDir(target)).toThrow("Teardown rechazado");
    }
    expect(fs.existsSync(import.meta.dirname)).toBe(true);
  });

  it.each([
    ["bad-real-adapter.ts", /@ai-sdk\/google|SDK real de proveedor/],
    ["bad-app-route.ts", /src[\\/]app|react/],
    ["bad-next-headers.ts", /next/],
    ["bad-unlisted-dependency.ts", /date-fns/],
  ])("rechaza %s con un error explícito de prestep y no deja directorio", async (entry, pattern) => {
    const before = fs.existsSync(BRIDGE_CACHE_ROOT) ? fs.readdirSync(BRIDGE_CACHE_ROOT) : [];
    await expect(buildTestBridge({ entry: fixture(entry) })).rejects.toThrow(pattern);
    await expect(buildTestBridge({ entry: fixture(entry) })).rejects.toThrow("Prestep del puente de test fallido");
    const after = fs.existsSync(BRIDGE_CACHE_ROOT) ? fs.readdirSync(BRIDGE_CACHE_ROOT) : [];
    expect(after.sort()).toEqual(before.sort());
  });

  it("falla de forma explícita si la entrada no existe", async () => {
    await expect(buildTestBridge({ entry: fixture("no-existe.ts") })).rejects.toThrow("Prestep del puente de test fallido");
  });
});

describe("guards de grafo y artefacto", () => {
  const chunk = (overrides: Partial<BridgeChunk>): BridgeChunk => ({ fileName: "h.mjs", code: "", imports: [], dynamicImports: [], moduleIds: [], ...overrides });

  it("acepta un grafo con solo externos permitidos", () => {
    expect(findBridgeViolations([chunk({ imports: ["zod", "node:crypto", "ai/test", "@supabase/supabase-js"], moduleIds: ["/r/src/lib/contracts/core.ts"] })])).toEqual([]);
  });

  it.each([
    [chunk({ imports: ["server-only"] }), "server-only"],
    [chunk({ imports: ["next/headers"] }), "next/headers"],
    [chunk({ dynamicImports: ["groq-sdk"] }), "groq-sdk"],
    [chunk({ imports: ["@hiero-ledger/sdk"] }), "@hiero-ledger/sdk"],
    [chunk({ imports: ["@ai-sdk/google"] }), "@ai-sdk/google"],
    [chunk({ imports: ["lodash"] }), "lodash"],
    [chunk({ moduleIds: ["C:\\r\\src\\app\\page.tsx"] }), "src"],
    [chunk({ moduleIds: ["/r/node_modules/next/headers.js"] }), "Next empaquetado"],
    [chunk({ code: 'import "server-only";' }), "sin resolver"],
  ])("rechaza %#", (c, fragment) => {
    const violations = findBridgeViolations([c]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join("\n")).toContain(fragment);
  });
});

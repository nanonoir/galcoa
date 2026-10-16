import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { buildTestBridge, BRIDGE_CACHE_ROOT, removeOwnDir, smokeImportBridge, type BridgeBuild } from "./build";
import type { createBridgeHandlers } from "./entry";
import { findBridgeViolations, type BridgeChunk } from "./guards";

const fixture = (name: string) => path.join(import.meta.dirname, "fixtures", name);
const built: BridgeBuild[] = [];
// Espacio de nombres propio de este archivo: otros procesos/tests no lo tocan ni lo ensucian.
const CACHE = path.join(BRIDGE_CACHE_ROOT, `test-${process.pid}-${randomUUID().slice(0, 8)}`);
const build = (entry: string, cacheRoot: string = CACHE) => buildTestBridge({ entry, cacheRoot });
const listOwn = (root: string = CACHE) => (fs.existsSync(root) ? fs.readdirSync(root).sort() : []);

afterEach(() => {
  for (const bridge of built.splice(0)) bridge.cleanup();
});

afterAll(() => {
  fs.rmSync(CACHE, { recursive: true, force: true });
});

describe("puente de test: build programático y smoke ESM", () => {
  it("genera un ESM aislado por ejecución que Node importa tal cual, con server-only resuelto", async () => {
    const first = await build(fixture("ok-entry.ts"));
    const second = await build(fixture("ok-entry.ts"));
    built.push(first, second);

    expect(first.dir).not.toBe(second.dir);
    expect(path.relative(CACHE, first.dir)).toBe(first.runId);
    const code = fs.readFileSync(first.file, "utf8");
    expect(code).not.toMatch(/server-only/);
    expect(smokeImportBridge(first)).toEqual(["composition"]);
  });

  it("el teardown elimina solo el directorio de su ejecución", async () => {
    const own = await build(fixture("ok-entry.ts"));
    const other = await build(fixture("ok-entry.ts"));
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
    const ns = path.join(CACHE, `fail-${randomUUID().slice(0, 8)}`);
    await expect(build(fixture(entry), ns)).rejects.toThrow(pattern);
    await expect(build(fixture(entry), ns)).rejects.toThrow("Prestep del puente de test fallido");
    expect(listOwn(ns)).toEqual([]);
  });

  it("llamadas concurrentes independientes limpian sus directorios al fallar y no tocan los ajenos", async () => {
    const ns = path.join(CACHE, `conc-${randomUUID().slice(0, 8)}`);
    const foreign = path.join(ns, "foreign-run");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "keep.txt"), "x");
    const ok = await build(fixture("ok-entry.ts"), ns);
    built.push(ok);

    const results = await Promise.allSettled([
      build(fixture("bad-real-adapter.ts"), ns),
      build(fixture("bad-app-route.ts"), ns),
      build(fixture("no-existe.ts"), ns),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(listOwn(ns)).toEqual([ok.runId, "foreign-run"].sort());
    expect(fs.existsSync(path.join(foreign, "keep.txt"))).toBe(true);
  });

  it("rechaza un cacheRoot fuera del caché del puente", async () => {
    await expect(buildTestBridge({ entry: fixture("ok-entry.ts"), cacheRoot: import.meta.dirname })).rejects.toThrow("cacheRoot rechazado");
  });

  it("falla de forma explícita si la entrada no existe", async () => {
    await expect(build(fixture("no-existe.ts"))).rejects.toThrow("Prestep del puente de test fallido");
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
    [chunk({ imports: ["@react-pdf/renderer"] }), "@react-pdf/renderer"],
    [chunk({ moduleIds: ["/r/node_modules/@react-pdf/renderer/lib/index.js"] }), "SDK real de proveedor"],
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

/**
 * Entry real del puente: se compila con los guards activos, se importa en un proceso Node
 * limpio y luego se ejerce el artefacto generado (no el fuente) con dobles explícitos.
 */
describe("entry real del puente de test", () => {
  const entry = path.join(import.meta.dirname, "entry.ts");
  const noSession = { currentUserId: async () => null };
  // Sin sesión ningún servicio llega a sus almacenes: los puertos no usados se declaran vacíos.
  const unused = {} as never;

  it("compila con los guards, se importa tal cual y expone las factories reales", async () => {
    const bridge = await build(entry);
    built.push(bridge);
    expect(smokeImportBridge(bridge)).toEqual(["BRIDGE_API_VERSION", "createBridgeHandlers", "createMirrorReader", "createTestComposition"]);
  });

  it("el artefacto compuesto responde sin sesión sin tocar almacenes ni proveedores", async () => {
    const bridge = await build(entry);
    built.push(bridge);
    const { createBridgeHandlers: create } = (await import(/* @vite-ignore */ bridge.fileUrl)) as { createBridgeHandlers: typeof createBridgeHandlers };

    const handlers = create({
      turn: { session: noSession, turns: unused, messages: unused, drafting: unused, currentDraftRevision: async () => 0 },
      evidence: { session: noSession, store: unused, storage: unused },
      contrast: { session: noSession, messages: unused, store: unused, groq: unused },
      verification: { store: unused, mirror: unused },
    });
    expect(Object.isFrozen(handlers)).toBe(true);

    const turn = await handlers.chatTurn(
      new Request("http://test.invalid/turn", { method: "POST", body: JSON.stringify({ clientMessageId: "k-1", content: "hola" }) }),
      "doc-1",
    );
    expect(turn.status).toBe(401);
    expect(await turn.json()).toMatchObject({ error: { code: "NO_SESSION" } });

    const upload = await handlers.evidence.requestUpload({});
    expect(upload).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });

    const verified = await handlers.verification.verify("referencia-invalida");
    expect(verified).toMatchObject({ registrationStatus: "no_iniciado", proof: null });
  });
});

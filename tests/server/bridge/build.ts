import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build, type Rolldown } from "vite";

import { assertBridgeGraph, type BridgeChunk } from "./guards";

/**
 * Puente Node para Playwright (MVP-120; data-transactions §7): build programático Vite de
 * una entrada de test a un módulo ESM para Node. NO es la app, ni un servidor, ni un overlay:
 * solo compila módulos para el runner. El centinela de `server-only` y el alias `@/` viven
 * únicamente aquí; ni Next ni el producto los ven.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
export const BRIDGE_CACHE_ROOT = path.join(ROOT, "node_modules", ".cache", "galcoa-tests");
const SENTINEL = path.join(ROOT, "tests", "server", "support", "server-only-sentinel.ts");
const OUTPUT_NAME = "handlers.mjs";

export type BridgeBuild = {
  runId: string;
  /** Directorio aislado de esta ejecución. */
  dir: string;
  /** Módulo ESM generado. */
  file: string;
  fileUrl: string;
  /** Elimina solo `dir`; idempotente. */
  cleanup(): void;
};

export type BridgeBuildOptions = {
  /** Entrada de test (ruta absoluta). */
  entry: string;
  /** Permite ampliar la lista de externos runtime para un caso concreto (p. ej. tests de guards). */
  allowedExternals?: readonly (string | RegExp)[];
};

export function removeOwnDir(dir: string): void {
  const resolved = path.resolve(dir);
  const relative = path.relative(BRIDGE_CACHE_ROOT, resolved);
  // Solo directorios hijos directos del caché de esta herramienta.
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.includes(path.sep)) {
    throw new Error(`Teardown rechazado: ${resolved} no es un directorio de ejecución del puente`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function toChunks(output: readonly (Rolldown.OutputChunk | Rolldown.OutputAsset)[]): BridgeChunk[] {
  return output
    .filter((item): item is Rolldown.OutputChunk => item.type === "chunk")
    .map((chunk) => ({
      fileName: chunk.fileName,
      code: chunk.code,
      imports: chunk.imports,
      dynamicImports: chunk.dynamicImports,
      moduleIds: Object.keys(chunk.modules),
    }));
}

/** Genera el bundle, aplica los guards y devuelve el módulo; ante cualquier fallo limpia y lanza. */
export async function buildTestBridge(options: BridgeBuildOptions): Promise<BridgeBuild> {
  const runId = `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(BRIDGE_CACHE_ROOT, runId);
  const file = path.join(dir, OUTPUT_NAME);
  const cleanup = () => removeOwnDir(dir);

  try {
    const result = await build({
      configFile: false,
      envDir: false,
      root: ROOT,
      logLevel: "warn",
      resolve: {
        alias: [
          { find: /^server-only$/, replacement: SENTINEL },
          { find: /^@\//, replacement: `${path.join(ROOT, "src")}/` },
        ],
      },
      build: {
        ssr: options.entry,
        outDir: dir,
        emptyOutDir: true,
        target: "node24",
        minify: false,
        sourcemap: false,
        write: true,
        rolldownOptions: { output: { format: "es", entryFileNames: OUTPUT_NAME } },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => ("output" in item ? item.output : []));
    assertBridgeGraph(toChunks(outputs), options.allowedExternals);
    if (!fs.existsSync(file)) throw new Error(`El prestep no generó ${OUTPUT_NAME}`);
  } catch (error) {
    if (fs.existsSync(dir)) cleanup();
    throw new Error(`Prestep del puente de test fallido: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return { runId, dir, file, fileUrl: pathToFileURL(file).href, cleanup };
}

/**
 * Smoke real: importa el ESM en un proceso Node limpio (sin Vitest ni alias) y devuelve los
 * nombres exportados. Falla si el módulo no se puede cargar tal cual lo vería el runner.
 */
export function smokeImportBridge(bridge: Pick<BridgeBuild, "fileUrl">): string[] {
  const script = `const m = await import(${JSON.stringify(bridge.fileUrl)}); console.log(JSON.stringify(Object.keys(m).sort()));`;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? "[]") as string[];
}

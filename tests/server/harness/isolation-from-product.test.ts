import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * El alias de `server-only` y el puente de test no existen fuera de la configuración de
 * test (MVP-120; data-transactions §7). Comprobación estática del repositorio real.
 */

const root = path.resolve(import.meta.dirname, "..", "..", "..");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listSources(full) : /\.(?:[cm]?[tj]sx?)$/.test(name) ? [full] : [];
  });
}

describe("producto aislado del harness", () => {
  it("la configuración de Next no alias `server-only` ni referencia tests", () => {
    const next = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(next).not.toMatch(/server-only|tests\/|alias/);
  });

  it("ningún archivo de src/ importa tests/, el puente, el centinela ni el caché generado", () => {
    for (const file of listSources(path.join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      expect(source, path.relative(root, file)).not.toMatch(/tests\/server|server-only-sentinel|galcoa-tests|from\s+["'](?:\.\.\/)+tests\//);
    }
  });

  it("el producto conserva el import real de server-only (el centinela no lo reemplaza en src/)", () => {
    const gemini = readFileSync(path.join(root, "src", "lib", "ai", "gemini", "structured.ts"), "utf8");
    expect(gemini).toMatch(/^import "server-only";/m);
  });

  it("el alias del centinela vive solo en configuraciones de test", () => {
    const holders = ["vitest.config.ts", "vitest.server-local.config.ts", path.join("tests", "server", "bridge", "build.ts")];
    const configs = readdirSync(root).filter((name) => /\.(?:config|setup)\.[cm]?[tj]s$|^(?:vite|vitest|next|playwright)\.config/.test(name));
    for (const name of configs) {
      const mentions = /server-only-sentinel/.test(readFileSync(path.join(root, name), "utf8"));
      expect(mentions, name).toBe(holders.includes(name));
    }
  });
});

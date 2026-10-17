import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve(import.meta.dirname, "..", "..", "scripts", "env-file.mjs");
// Valor ficticio: el test trabaja en una copia temporal del script y nunca toca el .env real.
const MARKER = "FAKE_ENV_MARKER=galcoa-test-only\n";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Repo temporal con el script en `scripts/` para que `root` sea el temporal. */
function sandbox() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "galcoa-env-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "scripts"));
  writeFileSync(path.join(dir, "scripts", "env-file.mjs"), readFileSync(script));
  const run = (...args: string[]) => spawnSync(process.execPath, [path.join(dir, "scripts", "env-file.mjs"), ...args], { encoding: "utf8" });
  return { dir, run };
}

describe("scripts/env-file.mjs", () => {
  it("check pasa sin archivos que sombreen .env", () => {
    const { dir, run } = sandbox();
    writeFileSync(path.join(dir, ".env"), MARKER);
    writeFileSync(path.join(dir, ".env.example.local"), "");
    expect(run("check").status).toBe(0);
  });

  it.each([".env.local", ".env.development.local", ".env.production", ".env.test"])("check falla con %s sin imprimir su contenido", (name) => {
    const { dir, run } = sandbox();
    writeFileSync(path.join(dir, name), MARKER);
    const result = run("check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
    expect(result.stdout + result.stderr).not.toContain("galcoa-test-only");
  });

  it("install copia el origen a .env sin imprimir contenido", () => {
    const { dir, run } = sandbox();
    const source = path.join(dir, "adjunto.env");
    writeFileSync(source, MARKER);
    const result = run("install", source);
    expect(result.status).toBe(0);
    expect(readFileSync(path.join(dir, ".env"), "utf8")).toBe(MARKER);
    expect(result.stdout + result.stderr).not.toContain("galcoa-test-only");
  });

  it("install no sobrescribe un .env existente", () => {
    const { dir, run } = sandbox();
    const source = path.join(dir, "adjunto.env");
    writeFileSync(source, "OTRO=1\n");
    writeFileSync(path.join(dir, ".env"), MARKER);
    expect(run("install", source).status).toBe(1);
    expect(readFileSync(path.join(dir, ".env"), "utf8")).toBe(MARKER);
  });

  it("install rechaza origen inexistente y .env.local presente", () => {
    const { dir, run } = sandbox();
    expect(run("install", path.join(dir, "no-existe")).status).toBe(1);
    expect(existsSync(path.join(dir, ".env"))).toBe(false);
    const source = path.join(dir, "adjunto.env");
    writeFileSync(source, MARKER);
    writeFileSync(path.join(dir, ".env.local"), "");
    expect(run("install", source).status).toBe(1);
    expect(existsSync(path.join(dir, ".env"))).toBe(false);
  });
});

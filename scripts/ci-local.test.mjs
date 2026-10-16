import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

// CLI ficticias en un directorio desechable; sin Docker ni red.
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "galcoa-ci-launcher-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["scripts/ci-local.mjs", "node_modules/supabase/dist/supabase.js", "node_modules/vitest/vitest.mjs", "tests/server/auth-flow/run-local-auth.mjs"]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), file.startsWith("scripts/")
      ? readFileSync(new URL("./ci-local.mjs", import.meta.url))
      : `const fs = require('node:fs'); fs.appendFileSync(process.env.CI_TEST_LOG, JSON.stringify({args:process.argv.slice(2),reset:process.env.RLS_SKIP_RESET})+'\\n'); console.log('PRIVATE_FIXTURE_OUTPUT'); console.error('PRIVATE_FIXTURE_OUTPUT'); process.exit(process.argv.includes(process.env.CI_TEST_FAIL) ? 1 : 0);`.replace("const fs = require('node:fs');", "import fs from 'node:fs';"));
  }
  const log = path.join(root, "calls.jsonl");
  return {
    calls: () => readFileSync(log, "utf8").trim().split("\n").map(JSON.parse),
    invoke: (mode, env = {}) => spawnSync(process.execPath, [path.join(root, "scripts/ci-local.mjs"), mode], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, GITHUB_ACTIONS: "true", RUNNER_OS: "Linux", CI_TEST_LOG: log, ...env },
    }),
  };
}

test("rechaza fuera de CI sin lanzar CLI", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke("test", { GITHUB_ACTIONS: "false" }).status, 1);
  assert.throws(f.calls);
});

test("suites en serie, reset forzado y Auth explícito sin salida privada", (t) => {
  const f = fixture(t);
  const result = f.invoke("test", { RLS_SKIP_RESET: "1" });
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.slice(0, 5).map((call) => call.args[2]), [
    "vitest.rls.config.ts", "vitest.server-local.config.ts", "tests/server/persistence/vitest.local.config.ts",
    "tests/server/persistence/executor/vitest.local.config.ts", "tests/server/routes/vitest.local.config.ts",
  ]);
  assert.deepEqual(calls[5].args, []);
  assert.ok(calls.every((call) => call.reset === "0"));
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_FIXTURE_OUTPUT/);
});

test("fallo cerrado sin filtración ni suite siguiente", (t) => {
  const f = fixture(t);
  const result = f.invoke("test", { CI_TEST_FAIL: "vitest.rls.config.ts" });
  assert.equal(result.status, 1);
  assert.equal(f.calls().length, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_FIXTURE_OUTPUT/);
});

test("parada acotada sin --all y salida CLI privada", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke("start").status, 0);
  const result = f.invoke("stop");
  assert.equal(result.status, 0);
  assert.deepEqual(f.calls().map((call) => call.args), [["start"], ["stop", "--project-id", "galcoa", "--no-backup"]]);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_FIXTURE_OUTPUT/);
});

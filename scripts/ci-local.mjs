// Exclusivo del runner efímero: nunca operar sobre la DB reservada de desarrollo.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "node_modules/supabase/dist/supabase.js");
const vitest = path.join(root, "node_modules/vitest/vitest.mjs");
const auth = path.join(root, "tests/server/auth-flow/run-local-auth.mjs");
const confirm = path.join(root, "tests/e2e/confirm/run.mjs");
const review = path.join(root, "tests/e2e/review/run.mjs");

// Solo los títulos de los tests fallidos (ya públicos en el repo): sin mensajes,
// valores, stacks ni salida cruda.
function printFailedTitles(report) {
  if (!report || !existsSync(report)) return;
  try {
    const { testResults = [] } = JSON.parse(readFileSync(report, "utf8"));
    for (const file of testResults) {
      for (const test of file.assertionResults ?? []) {
        if (test.status === "failed") console.error(`CI local: ✗ ${path.relative(root, file.name)} › ${test.fullName}`);
      }
    }
  } catch {
    console.error("CI local: no se pudo leer el reporte de títulos.");
  } finally {
    rmSync(report, { force: true });
  }
}

function run(label, file, args, timeout, report) {
  console.log(`CI local: ${label}`);
  // Incluso errores de reset, Auth o Playwright pueden contener claves/cookies.
  // No publicar salida cruda, archivos de entorno, trazas ni reportes de este job.
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    env: { ...process.env, RLS_SKIP_RESET: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    console.error(`CI local: status=${result.status ?? "null"}, signal=${result.signal ?? "none"}, timeout=${result.error?.code === "ETIMEDOUT"}`);
    console.error(`CI local: ${label} falló (salida privada descartada). Reproducir con la pila local exclusiva; no publicar logs sin revisión.`);
    printFailedTitles(report);
    process.exitCode = 1;
    return false;
  }
  console.log(`CI local: ${label} OK`);
  return true;
}

if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_OS !== "Linux") {
  console.error("Este lanzador requiere un runner Linux efímero de GitHub Actions.");
  process.exitCode = 1;
} else {
  switch (process.argv[2]) {
    case "start":
      run("arrancar Supabase local", cli, ["start"], 900_000);
      break;
    case "stop":
      // No --all: solo el proyecto galcoa de este runner desechable.
      run("detener Supabase local", cli, ["stop", "--project-id", "galcoa", "--no-backup"], 120_000);
      break;
    case "test": {
      const suites = [
        ["RLS", "vitest.rls.config.ts"],
        ["servidor local", "vitest.server-local.config.ts"],
        ["persistencia", "tests/server/persistence/vitest.local.config.ts"],
        ["executor", "tests/server/persistence/executor/vitest.local.config.ts"],
        ["rutas", "tests/server/routes/vitest.local.config.ts"],
        ["persistencia de evidencias", "tests/server/evidence-persistence/vitest.local.config.ts"],
      ];
      for (const [label, config] of suites) {
        const report = path.join(os.tmpdir(), `ci-local-${path.basename(config, ".ts")}.json`);
        const args = ["run", "--config", config, "--reporter=default", "--reporter=json", `--outputFile.json=${report}`];
        if (!run(label, vitest, args, 480_000, report)) break;
      }
      if (!process.exitCode) run("Auth real local (3 casos, sin trazas)", auth, [], 480_000);
      if (!process.exitCode) run("confirmaciones E2E reales locales (sin trazas)", confirm, [], 480_000);
      if (!process.exitCode) run("revisión del autor E2E real local (sin trazas)", review, [], 600_000);
      break;
    }
    default:
      console.error("Uso: node scripts/ci-local.mjs start|test|stop");
      process.exitCode = 1;
  }
}

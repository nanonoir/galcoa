// Ejecuta el E2E del flujo de revisión del autor (#21) contra la pila local YA en marcha.
// Obtiene URL y clave pública de `supabase status` dentro del proceso, siembra datos
// ficticios, pasa credenciales efímeras por un archivo temporal y lo borra al terminar.
// Nunca imprime URL, claves, contraseñas ni tokens ni lee `.env`. Falla si falta un prerrequisito.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js");
const bin = (...parts) => path.join(ROOT, "node_modules", ...parts);
const cliEnv = process.env.GALCOA_SUPABASE_CLI_DOCKER_HOST ? { ...process.env, DOCKER_HOST: process.env.GALCOA_SUPABASE_CLI_DOCKER_HOST } : process.env;

function readStatus() {
  const output = execFileSync(process.execPath, [SUPABASE_CLI, "status", "-o", "env"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "ignore"],
    env: cliEnv,
  });
  const status = new Map();
  for (const line of output.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) status.set(line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, ""));
  }
  return status;
}

function run() {
  let status;
  try {
    status = readStatus();
  } catch {
    console.error("test:e2e:review — la pila local de Supabase no responde. Ejecuta `npx supabase start` (requiere Docker) y reintenta.");
    return 1;
  }
  const supabaseUrl = status.get("API_URL");
  const publishableKey = status.get("PUBLISHABLE_KEY") || status.get("ANON_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.error("test:e2e:review — faltan API_URL o la clave pública en `supabase status`.");
    return 1;
  }

  // Un volumen anterior puede tener menos migraciones que el repo: se exige una base al día.
  try {
    const applied = execFileSync(process.platform === "win32" ? "docker.exe" : "docker", ["exec", "-i", "supabase_db_galcoa", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", "select count(*) from supabase_migrations.schema_migrations"], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] });
    const expected = readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).length;
    if (Number(applied.trim()) !== expected) {
      console.error(`test:e2e:review — la base local tiene ${applied.trim()} migraciones y el repo ${expected}. Ejecuta \`npx supabase db reset --local --no-seed\` sobre tu pila exclusiva y reintenta.`);
      return 1;
    }
  } catch {
    console.error("test:e2e:review — no se pudo comprobar las migraciones de la base local.");
    return 1;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "galcoa-review-e2e-"));
  const env = {
    ...process.env,
    REVIEW_E2E: "1",
    REVIEW_E2E_SEED_FILE: path.join(dir, "seed.json"),
    REVIEW_E2E_SUPABASE_URL: supabaseUrl,
    REVIEW_E2E_PUBLISHABLE_KEY: publishableKey,
  };
  try {
    const seed = spawnSync(process.execPath, [bin("vitest", "vitest.mjs"), "run", "--config", "tests/e2e/review/vitest.seed.config.ts"], { cwd: ROOT, stdio: "inherit", env, timeout: 300_000 });
    if (seed.status !== 0) {
      console.error("test:e2e:review — la siembra falló.");
      return 1;
    }
    const pw = spawnSync(process.execPath, [bin("@playwright", "test", "cli.js"), "test", "-c", "tests/e2e/review/review.config.ts", ...process.argv.slice(2)], { cwd: ROOT, stdio: "inherit", env, timeout: 900_000 });
    return pw.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    // Playwright vuelca una instantánea del DOM al fallar: contendría enlaces con token.
    rmSync(path.join(ROOT, "test-results", "review"), { recursive: true, force: true });
  }
}

process.exitCode = run();

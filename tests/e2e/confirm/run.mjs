// Ejecuta el E2E de la pantalla pública (MVP-076) contra la pila local YA en marcha.
// Obtiene URL y clave pública de `supabase status` dentro del proceso, siembra datos
// ficticios, pasa los tokens por un archivo temporal y lo borra al terminar.
// Nunca imprime URL, claves ni tokens ni lee `.env`. Falla si falta un prerrequisito.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js");
const bin = (...parts) => path.join(ROOT, "node_modules", ...parts);

const fail = (message) => {
  console.error(`test:e2e:confirm — ${message}`);
  process.exit(1);
};

let output;
try {
  output = execFileSync(process.execPath, [SUPABASE_CLI, "status", "-o", "env"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "ignore"],
    env: process.env.GALCOA_SUPABASE_CLI_DOCKER_HOST ? { ...process.env, DOCKER_HOST: process.env.GALCOA_SUPABASE_CLI_DOCKER_HOST } : process.env,
  });
} catch {
  fail("la pila local de Supabase no responde. Ejecuta `npx supabase start` (requiere Docker) y reintenta.");
}
const status = new Map();
for (const line of output.split(/\r?\n/)) {
  const eq = line.indexOf("=");
  if (eq > 0) status.set(line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, ""));
}
const supabaseUrl = status.get("API_URL");
const publishableKey = status.get("PUBLISHABLE_KEY") || status.get("ANON_KEY");
if (!supabaseUrl || !publishableKey) fail("faltan API_URL o la clave pública en `supabase status`.");

const dir = mkdtempSync(path.join(os.tmpdir(), "galcoa-confirm-e2e-"));
const seedFile = path.join(dir, "seed.json");
const env = { ...process.env, CONFIRM_E2E: "1", CONFIRM_E2E_SEED_FILE: seedFile, CONFIRM_E2E_SUPABASE_URL: supabaseUrl, CONFIRM_E2E_PUBLISHABLE_KEY: publishableKey };

let code = 1;
try {
  const seed = spawnSync(process.execPath, [bin("vitest", "vitest.mjs"), "run", "--config", "tests/e2e/confirm/vitest.seed.config.ts"], { cwd: ROOT, stdio: "inherit", env });
  if (seed.status !== 0) fail("la siembra falló.");
  const pw = spawnSync(process.execPath, [bin("@playwright", "test", "cli.js"), "test", "-c", "tests/e2e/confirm/confirm.config.ts", ...process.argv.slice(2)], { cwd: ROOT, stdio: "inherit", env });
  code = pw.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);

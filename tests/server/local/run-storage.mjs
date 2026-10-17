// Pila exclusivamente propia: configuración temporal, sin .env ni credenciales impresas.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(root, "node_modules/supabase/dist/supabase.js");
const project = `galcoa-storage-${randomUUID().slice(0, 8)}`;
const temporaryRoot = path.join(os.tmpdir(), "opencode");
mkdirSync(temporaryRoot, { recursive: true });
const workdir = mkdtempSync(path.join(temporaryRoot, "galcoa-storage-"));
const env = { ...process.env, GALCOA_LOCAL_TEST_WORKDIR: workdir, GALCOA_LOCAL_TEST_CONTAINER: `supabase_db_${project}`, RLS_SKIP_RESET: "1" };
const cliEnv = env.GALCOA_SUPABASE_CLI_DOCKER_HOST ? { ...env, DOCKER_HOST: env.GALCOA_SUPABASE_CLI_DOCKER_HOST } : env;
let started = false;
let exit = 1;
let cleaned = true;
function runCli(args, timeout = 300_000) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: workdir, env: cliEnv, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    // Nunca vuelca stdout/stderr de la CLI: pueden incluir claves locales.
    const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const diagnostic = ["permission denied", "port is already allocated", "connection refused", "Access is denied", "failed to connect", "context deadline exceeded", "image not found"].find((s) => text.toLowerCase().includes(s.toLowerCase()));
    throw new Error(`Supabase ${args[0]} falló (exit=${result.status}, ${result.error?.code ?? diagnostic ?? "salida privada retenida solo en memoria"})`);
  }
}
try {
  for (const port of [55320, 55321, 55322, 55323, 55324, 55327, 55328, 55329]) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", () => reject(new Error(`Puerto local ${port} ocupado; no se toca su proceso`)));
      server.listen(port, "0.0.0.0", () => server.close(resolve));
    });
  }
  mkdirSync(path.join(workdir, "supabase"));
  const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8")
    .replace('project_id = "galcoa"', `project_id = "${project}"`)
    .replace(/543(\d{2})/g, "553$1");
  if (!config.includes(`project_id = "${project}"`)) throw new Error("No se pudo aislar project_id; no se arranca ninguna pila");
  writeFileSync(path.join(workdir, "supabase/config.toml"), config);
  cpSync(path.join(root, "supabase/migrations"), path.join(workdir, "supabase/migrations"), { recursive: true });
  console.log(`Storage real: proyecto propio ${project}, API 55321, DB 55322`);
  started = true; // También limpia un arranque parcial, solo de este ID único.
  runCli(["start"]);
  console.log("Supabase propio iniciado; migraciones del repositorio aplicadas");
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.storage-local.config.ts"], {
    cwd: root, env, stdio: "inherit", timeout: 240_000,
  });
  exit = result.status ?? 1;
} catch (error) {
  console.error(error.message);
} finally {
  if (started) {
    try { runCli(["stop", "--project-id", project, "--no-backup"], 120_000); console.log("Pila propia detenida y volúmenes efímeros eliminados"); }
    catch (error) { console.error(`Limpieza pendiente (${project}, configuración ${workdir}): ${error.message}`); exit = 1; cleaned = false; }
  }
  if (cleaned) rmSync(workdir, { recursive: true, force: true });
}
process.exitCode = exit;

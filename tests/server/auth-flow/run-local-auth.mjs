// Ejecuta el E2E real de Auth (MVP-031) contra la pila local de Supabase YA en marcha
// (`npx supabase start`; este script no la arranca ni la detiene). Obtiene la URL y la
// clave pública efímeras de `supabase status` dentro del proceso, las pasa por entorno
// al hijo y NUNCA las imprime, escribe ni lee de `.env`. Falla de inmediato si falta un
// prerrequisito: no hay omisiones silenciosas.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js");
const PLAYWRIGHT_CLI = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");

function fail(message) {
  console.error(`test:e2e:auth — ${message}`);
  process.exit(1);
}

let output;
try {
  output = execFileSync(process.execPath, [SUPABASE_CLI, "status", "-o", "env"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "ignore"],
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
const mailUrl = status.get("MAILPIT_URL") || status.get("INBUCKET_URL");
const missing = [
  ["API_URL", supabaseUrl],
  ["PUBLISHABLE_KEY/ANON_KEY", publishableKey],
  ["MAILPIT_URL (¿`[local_smtp] enabled = true`?)", mailUrl],
].filter(([, value]) => !value).map(([name]) => name);
if (missing.length > 0) fail(`faltan datos de \`supabase status\`: ${missing.join(", ")}.`);

// El buzón debe responder: sigue siendo necesario para recuperar la contraseña.
try {
  const response = await fetch(`${mailUrl}/api/v1/messages?limit=1`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(String(response.status));
} catch {
  fail("el buzón local (Mailpit) no responde. Revisa `[local_smtp] enabled = true` en supabase/config.toml y reinicia la pila.");
}

const child = spawnSync(process.execPath, [PLAYWRIGHT_CLI, "test", "-c", "tests/e2e/auth.config.ts", ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    AUTH_E2E: "1",
    AUTH_E2E_SUPABASE_URL: supabaseUrl,
    AUTH_E2E_PUBLISHABLE_KEY: publishableKey,
    AUTH_E2E_MAIL_URL: mailUrl,
  },
});
process.exit(child.status ?? 1);

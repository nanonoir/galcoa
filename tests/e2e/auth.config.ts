import { defineConfig, devices } from "@playwright/test";

/**
 * E2E real de Auth local (MVP-031). Configuración **propia**: no toca los
 * puertos ni los servidores de `playwright.config.ts`. Necesita una instancia
 * local de Supabase con confirmación de correo activa (ver `docs/auth-local.md`)
 * y estas variables (valores de `npx supabase status`, nunca de `.env`):
 *
 *   AUTH_E2E_SUPABASE_URL       URL del API local, p. ej. http://127.0.0.1:54321
 *   AUTH_E2E_PUBLISHABLE_KEY    clave pública (anon/publishable) efímera de la instancia
 *   AUTH_E2E_MAIL_URL           buzón local (Mailpit), p. ej. http://127.0.0.1:54324
 *   AUTH_E2E_PORT               puerto de Next para esta suite (por defecto 3217)
 *
 * Sin ellas la suite queda **omitida y lo dice**: no hay doble que la sustituya.
 * Ejecución: `npx playwright test -c tests/e2e/auth.config.ts`.
 */

const PORT = Number(process.env.AUTH_E2E_PORT ?? 3217);
const supabaseUrl = process.env.AUTH_E2E_SUPABASE_URL;
const publishableKey = process.env.AUTH_E2E_PUBLISHABLE_KEY;
const configured = Boolean(supabaseUrl && publishableKey && process.env.AUTH_E2E_MAIL_URL);

export default defineConfig({
  testDir: ".",
  testMatch: "auth*.spec.ts",
  outputDir: "../../test-results/auth",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: configured
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
        url: `http://127.0.0.1:${PORT}/acceso`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl!,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey!,
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});

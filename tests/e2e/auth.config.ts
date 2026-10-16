import { defineConfig, devices } from "@playwright/test";

import { resolveAuthE2eEnv } from "./auth-env";

/**
 * E2E real de Auth local (MVP-031). Configuración **propia**: no toca los
 * puertos ni los servidores de `playwright.config.ts`. Se ejecuta con
 * `npm run test:e2e:auth`, que obtiene los datos efímeros de la pila local
 * (`tests/server/auth-flow/run-local-auth.mjs`) sin imprimirlos ni leer `.env`.
 *
 * Opt-in explícito: sin `AUTH_E2E=1` la suite se omite; con `AUTH_E2E=1` y datos
 * faltantes esta configuración **falla** (ver `auth-env.ts`). Detalle en
 * `docs/auth-local.md`.
 */

const e2e = resolveAuthE2eEnv(process.env);
const PORT = e2e?.port ?? 3217;

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
    // Sin trazas: contendrían cuerpos de petición con credenciales de prueba.
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: e2e
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
        url: `http://127.0.0.1:${PORT}/acceso`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
          NEXT_PUBLIC_SUPABASE_URL: e2e.supabaseUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: e2e.publishableKey,
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});

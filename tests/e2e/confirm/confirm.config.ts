import { defineConfig, devices } from "@playwright/test";

/**
 * E2E real de la pantalla pública de confirmación (MVP-076) contra la pila local.
 * Configuración **propia** (puerto 3218, sin tocar `playwright.config.ts`). Se ejecuta
 * con `npm run test:e2e:confirm`, que siembra datos ficticios y pasa los tokens por un
 * archivo temporal que borra al terminar. Sin `CONFIRM_E2E=1` la suite no corre.
 */

const enabled = process.env.CONFIRM_E2E === "1";
const PORT = Number(process.env.CONFIRM_E2E_PORT ?? 3218);

export default defineConfig({
  testDir: ".",
  testMatch: "confirm.spec.ts",
  outputDir: "../../../test-results/confirm",
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
    // Sin trazas ni capturas: la URL contiene el token de prueba.
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: enabled
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
        url: `http://127.0.0.1:${PORT}/acceso`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
          NEXT_PUBLIC_SUPABASE_URL: process.env.CONFIRM_E2E_SUPABASE_URL ?? "",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.CONFIRM_E2E_PUBLISHABLE_KEY ?? "",
        },
      }
    : undefined,
});

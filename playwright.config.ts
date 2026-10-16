import { defineConfig, devices } from "@playwright/test";

/**
 * E2E con Chromium. Dos proyectos, cada uno con su servidor propio y puerto
 * dedicado (sin reutilizar servidores ajenos, para que la evidencia sea nuestra):
 * - preview: Vite en loopback con datos ficticios (`npm run preview:ui`).
 * - next: arranque real de Next sin credenciales. Es la plantilla base, no un MVP.
 * Playwright detiene los servidores que lanzó al terminar.
 */

const PREVIEW_PORT = 4173;
const NEXT_PORT = 3100;

/** Sin `--project`, se ejecutan todos; con él, solo se arranca el servidor necesario. */
function selectedProjects(): string[] | null {
  const names: string[] = [];
  const argv = process.argv;
  argv.forEach((arg, i) => {
    if (arg.startsWith("--project=")) names.push(arg.slice("--project=".length));
    else if (arg === "--project" || arg === "-p") names.push(argv[i + 1] ?? "");
  });
  return names.length > 0 ? names : null;
}
const selected = selectedProjects();
const wants = (name: string) => selected === null || selected.includes(name);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "preview",
      testMatch: "preview.spec.ts",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
    },
    {
      name: "next",
      testMatch: "next.spec.ts",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", baseURL: `http://127.0.0.1:${NEXT_PORT}` },
    },
  ],
  webServer: [
    ...(wants("preview")
      ? [
          {
            command: "npm run preview:ui",
            url: `http://127.0.0.1:${PREVIEW_PORT}/`,
            reuseExistingServer: false,
            timeout: 60_000,
            stdout: "pipe" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
    ...(wants("next")
      ? [
          {
            command: `npm run dev -- --hostname 127.0.0.1 --port ${NEXT_PORT}`,
            url: `http://127.0.0.1:${NEXT_PORT}/`,
            reuseExistingServer: false,
            timeout: 180_000,
            env: { NEXT_TELEMETRY_DISABLED: "1" },
            stdout: "pipe" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
  ],
});

import path from "node:path";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

// Sin `passWithNoTests`: un proyecto sin archivos de prueba debe fallar.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "contracts",
          environment: "node",
          include: ["tests/contracts/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "preview/**/*.test.tsx"],
          setupFiles: ["tests/setup.dom.ts"],
        },
      },
      {
        // Servidor con dobles (MVP-120): sin Docker ni credenciales. La base local real vive
        // en `vitest.rls.config.ts` y `vitest.server-local.config.ts` (scripts aparte).
        // `server-only` → centinela vacío solo en este proyecto de test; Next lo conserva.
        extends: true,
        resolve: {
          alias: [{ find: /^server-only$/, replacement: path.resolve(import.meta.dirname, "tests/server/support/server-only-sentinel.ts") }],
        },
        test: {
          name: "server",
          environment: "node",
          include: ["tests/server/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "tests/server/rls/**", "tests/server/local/**"],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "boundaries",
          environment: "node",
          include: ["tests/boundaries/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});

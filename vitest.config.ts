import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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

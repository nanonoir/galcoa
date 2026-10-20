import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { createBoundaryConfigs } from "./tests/boundaries/manifest.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Barreras de arquitectura (docs/architecture.md); ver tests/boundaries/.
  ...createBoundaryConfigs({ basePath: import.meta.dirname }),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e-confirm/**",
    ".next-e2e-review/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos generados por Playwright/Vitest.
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;

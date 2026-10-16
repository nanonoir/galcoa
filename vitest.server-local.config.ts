import path from "node:path";

import { defineConfig } from "vitest/config";

// Harness de servidor con base real (MVP-120): Supabase local efímero. Config y script
// aparte para que `npm test` no exija Docker. Si la pila local no está en marcha, el
// globalSetup FALLA (no se omite): ver tests/server/rls/global-setup.ts.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: path.resolve(import.meta.dirname, "tests/server/support/server-only-sentinel.ts") },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "src")}/` },
    ],
  },
  test: {
    name: "server-local",
    environment: "node",
    include: ["tests/server/local/**/*.test.ts"],
    globalSetup: ["tests/server/rls/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

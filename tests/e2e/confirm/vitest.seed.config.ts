import path from "node:path";

import { defineConfig } from "vitest/config";

// Siembra del E2E de la pantalla pública (MVP-076). Config propia: no entra en `npm test`
// ni en `test:server:local`. Requiere la pila local de Supabase ya en marcha.
const root = path.resolve(import.meta.dirname, "..", "..", "..");

export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: path.resolve(root, "tests/server/support/server-only-sentinel.ts") },
      { find: /^@\//, replacement: `${path.resolve(root, "src")}/` },
    ],
  },
  test: {
    name: "confirm-e2e-seed",
    environment: "node",
    include: ["tests/e2e/confirm/seed.local.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});

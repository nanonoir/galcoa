import path from "node:path";

import { defineConfig } from "vitest/config";

// Suite con base real (Supabase local). Config y script aparte para que
// `npm test` no exija Docker (docs/design/data-transactions.md §7).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    name: "rls",
    environment: "node",
    include: ["tests/server/rls/**/*.test.ts"],
    globalSetup: ["tests/server/rls/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

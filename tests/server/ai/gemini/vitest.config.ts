import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Configuración local de MVP-050 (Issue #12, §8): el Vitest global todavía no
 * descubre `tests/server/**` (eso es MVP-120). Entorno Node e include acotado a
 * este módulo. `server-only` se resuelve a su variante `react-server` (archivo
 * vacío del propio paquete) solo aquí; el producto conserva el marcador intacto.
 *
 * Uso: npx vitest run --config tests/server/ai/gemini/vitest.config.ts
 */
const root = path.resolve(import.meta.dirname, "../../../..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    name: "server-ai-gemini",
    environment: "node",
    include: ["tests/server/ai/gemini/**/*.test.ts"],
  },
});

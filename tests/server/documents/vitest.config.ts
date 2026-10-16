import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Configuración local de F4 (MVP-040/041/044, Issue #10): el Vitest global todavía no
 * descubre `tests/server/**` (eso es MVP-120). Entorno Node e include acotado a
 * este módulo. `server-only` se resuelve a su variante `react-server` (archivo
 * vacío del propio paquete) solo aquí; el producto conserva el marcador intacto.
 *
 * Uso: npx vitest run --config tests/server/documents/vitest.config.ts
 */
const root = path.resolve(import.meta.dirname, "../../..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    name: "server-documents",
    environment: "node",
    include: ["tests/server/documents/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";

import base from "./vitest.server-local.config";

// Separada de la suite compartida: exige el launcher con una pila exclusivamente propia.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    name: "storage-local",
    include: ["tests/server/local/storage-publication.real.ts"],
  },
});

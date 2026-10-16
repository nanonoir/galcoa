import { defineConfig } from "vitest/config";

import base from "../../../vitest.server-local.config";

/** Misma pila y setup compartidos; ejecutar solo con la reserva de DB concedida. */
export default defineConfig({ ...base, test: { ...base.test, include: ["tests/server/persistence/*.integration.ts"] } });

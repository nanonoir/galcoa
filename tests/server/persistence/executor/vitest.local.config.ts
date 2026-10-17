import { defineConfig } from "vitest/config";

import base from "../../../../vitest.server-local.config";

/** Requiere reserva exclusiva; reutiliza reset y setup RLS existentes. */
export default defineConfig({ ...base, test: { ...base.test, include: ["tests/server/persistence/executor/*.integration.ts"] } });

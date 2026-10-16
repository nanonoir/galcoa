import { defineConfig } from "vitest/config";

import base from "../../../vitest.server-local.config";

export default defineConfig({ ...base, test: { ...base.test, include: ["tests/server/routes/*.integration.ts"] } });

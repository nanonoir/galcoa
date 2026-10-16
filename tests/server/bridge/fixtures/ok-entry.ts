import { SchemaVersionSchema } from "@/lib/contracts/common";

import { createTestComposition } from "../entry";

import { marked } from "./server-marked";

// Fixture válida: usa el alias `@/`, un módulo con `import "server-only"` y zod (externo permitido).
export const composition = createTestComposition({ marked, schemaVersion: SchemaVersionSchema.parse(1) });

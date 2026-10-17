import { z } from "zod";

import { DocumentSummarySchema } from "./document";

/**
 * Estado de vista del dashboard. `loading`/`error` son estados de UI, no de
 * negocio: no corresponden a ninguna dimensión del PRD §5. Una lista vacía es
 * `ready` con `documents: []`.
 */
export const DashboardViewStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("loading") }),
  z.strictObject({ status: z.literal("error"), message: z.string().min(1) }),
  z.strictObject({
    status: z.literal("ready"),
    documents: z.array(DocumentSummarySchema),
  }),
]);

export type DashboardViewState = z.infer<typeof DashboardViewStateSchema>;

import { z } from "zod";

import {
  ConfirmationStatusSchema,
  ControlStatusSchema,
  DocumentStatusSchema,
  HcsStatusSchema,
} from "./document";
import { IdSchema } from "./common";
import { FrozenOperationSchema } from "./review";

/**
 * Estado de vista del snapshot congelado (MVP-112; PRD REQ-08, INV-11, INV-14).
 * `loading`, `error` y `empty` son estados de UI, no dimensiones del PRD §5.
 * `empty` = todavía no hay revisión congelada. Las cuatro dimensiones de estado
 * viajan separadas y ninguna se deriva de otra; el contenido reutiliza
 * `FrozenOperationSchema` (fuentes como alias locales, nunca ids privados).
 */
export const SnapshotViewStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("loading") }),
  z.strictObject({ status: z.literal("error"), message: z.string().min(1) }),
  z.strictObject({ status: z.literal("empty") }),
  z.strictObject({
    status: z.literal("ready"),
    revisionId: IdSchema,
    snapshotId: IdSchema,
    content: FrozenOperationSchema,
    documentStatus: DocumentStatusSchema,
    controlStatus: ControlStatusSchema,
    confirmationStatus: ConfirmationStatusSchema,
    hcsStatus: HcsStatusSchema,
  }),
]);

export type SnapshotViewState = z.infer<typeof SnapshotViewStateSchema>;

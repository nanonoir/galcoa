import { z } from "zod";

import { IdSchema, InstantSchema } from "./common";
import { HcsStatusSchema } from "./document";

/**
 * Estado de vista del historial de versiones (MVP-113; PRD REQ-09, INV-05, INV-18).
 * Proyección propia por allowlist: no incluye PDF, manifiesto, hashes ni
 * ubicaciones privadas de `DocumentVersionSchema`. Finalización y sello son
 * independientes: toda versión del historial está finalizada y su `hcsStatus`
 * puede ser `pendiente` o `fallido` sin deshacerla. Un historial vacío es
 * `ready` con `versions: []`.
 */
export const VersionHistoryItemSchema = z.strictObject({
  versionId: IdSchema,
  /** Número visible (v1, v2…), ascendente dentro del documento. */
  number: z.number().int().positive(),
  /** Versión finalizada anterior; `null` en la primera. */
  previousVersionId: IdSchema.nullable(),
  revisionId: IdSchema,
  snapshotId: IdSchema,
  finalizedAt: InstantSchema,
  hcsStatus: HcsStatusSchema,
});

export const VersionHistoryViewStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("loading") }),
  z.strictObject({ status: z.literal("error"), message: z.string().min(1) }),
  z.strictObject({
    status: z.literal("ready"),
    versions: z.array(VersionHistoryItemSchema),
  }),
]);

export type VersionHistoryItem = z.infer<typeof VersionHistoryItemSchema>;
export type VersionHistoryViewState = z.infer<typeof VersionHistoryViewStateSchema>;

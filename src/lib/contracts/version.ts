import { z } from "zod";

import { IdSchema, InstantSchema, SchemaVersionSchema, Sha256HexSchema } from "./common";
import { DeclaredNameSchema } from "./confirmation";
import { HcsStatusSchema } from "./document";
import { ThirdPartyRoleSchema } from "./review";

/**
 * Versión finalizada y sello HCS (MVP-021; INV-05, INV-17, INV-18; SH-05/06).
 * La finalización y el sello son registros separados: una versión finalizada
 * existe aunque el sello esté pendiente o haya fallado un intento.
 */

/** Constancia incorporada al anexo: una por respuesta confirmada, tomada de lo persistido. */
export const ReceiptSchema = z.strictObject({
  responseId: IdSchema,
  role: z.enum(["autor", ...ThirdPartyRoleSchema.options]),
  /** `null` para el autor; nombre autodeclarado (no identidad verificada) para terceros. */
  declaredName: DeclaredNameSchema.nullable(),
  respondedAt: InstantSchema,
});

/** Referencia privada a un artefacto inmutable; nunca se proyecta a DTO públicos. */
export const PrivateArtifactRefSchema = z.strictObject({
  location: z.string().min(1),
  sha256: Sha256HexSchema,
  byteLength: z.number().int().nonnegative(),
});

export const DocumentVersionSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  versionId: IdSchema,
  /** Versión finalizada anterior del mismo documento; `null` en la primera. */
  previousVersionId: IdSchema.nullable(),
  documentId: IdSchema,
  revisionId: IdSchema,
  snapshotId: IdSchema,
  snapshotHash: Sha256HexSchema,
  receipts: z.array(ReceiptSchema).min(1),
  pdf: PrivateArtifactRefSchema,
  manifest: PrivateArtifactRefSchema,
  /** Referencia pública opaca, distinta de tokens y de claves privadas. */
  publicReference: IdSchema,
  finalizedAt: InstantSchema,
});

/** Resultado de un intento HCS. `incierto` es resultado técnico, no un estado de producto (SH-06). */
export const HcsAttemptOutcomeSchema = z.enum(["pendiente", "registrado", "fallido", "incierto"]);

export const HcsConsensusSchema = z.strictObject({
  topicId: z.string().min(1),
  network: z.literal("testnet"),
  sequenceNumber: z.number().int().positive(),
  consensusTimestamp: InstantSchema,
});

export const HcsAttemptSchema = z.strictObject({
  attemptId: IdSchema,
  transactionId: z.string().min(1).nullable(),
  /** Hash del payload exacto enviado; solo hash e identificadores opacos viajan a HCS (INV-06). */
  payloadHash: Sha256HexSchema,
  outcome: HcsAttemptOutcomeSchema,
  attemptedAt: InstantSchema,
});

export const HcsSealSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    versionId: IdSchema,
    status: HcsStatusSchema,
    manifestHash: Sha256HexSchema.nullable(),
    attempts: z.array(HcsAttemptSchema),
    /** Solo con consenso comprobado. */
    consensus: HcsConsensusSchema.nullable(),
  })
  .refine((s) => (s.status === "registrado") === (s.consensus !== null), {
    message: "consensus existe si y solo si el sello está registrado",
    path: ["consensus"],
  })
  .refine((s) => s.status !== "no_iniciado" || s.attempts.length === 0, {
    message: "no_iniciado no tiene intentos",
    path: ["attempts"],
  })
  .refine((s) => s.status === "no_iniciado" || s.manifestHash !== null, {
    message: "El sello iniciado conserva el manifestHash",
    path: ["manifestHash"],
  });

export type Receipt = z.infer<typeof ReceiptSchema>;
export type PrivateArtifactRef = z.infer<typeof PrivateArtifactRefSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type HcsAttemptOutcome = z.infer<typeof HcsAttemptOutcomeSchema>;
export type HcsConsensus = z.infer<typeof HcsConsensusSchema>;
export type HcsAttempt = z.infer<typeof HcsAttemptSchema>;
export type HcsSeal = z.infer<typeof HcsSealSchema>;

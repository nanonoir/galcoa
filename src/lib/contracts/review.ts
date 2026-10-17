import { z } from "zod";

import { IdSchema, InstantSchema, SchemaVersionSchema, Sha256HexSchema } from "./common";
import { OperationContentSchema } from "./core";
import { ConfirmationStatusSchema, ControlStatusSchema, DocumentStatusSchema } from "./document";

/**
 * Revisión congelada y snapshot (MVP-021; PRD §5, INV-11, INV-14, INV-17; SH-01/02).
 * `revisionId` y `snapshotId` son identidades distintas; el hash no autoriza acceso.
 */

export const ParticipantRoleSchema = z.enum(["autor", "intermediario", "comprador"]);
export const ThirdPartyRoleSchema = z.enum(["intermediario", "comprador"]);

/**
 * Exactamente las cuatro combinaciones del PRD, siempre con autor y en orden
 * canónico (autor, intermediario, comprador), independiente del orden de clics.
 */
export const ParticipantSelectionSchema = z.union([
  z.tuple([z.literal("autor")]),
  z.tuple([z.literal("autor"), z.literal("intermediario")]),
  z.tuple([z.literal("autor"), z.literal("comprador")]),
  z.tuple([z.literal("autor"), z.literal("intermediario"), z.literal("comprador")]),
]);

/** Referencia descriptiva local al snapshot («Fuente A»): no es un id interno ni autoriza acceso. */
export const SourceAliasSchema = z.strictObject({
  alias: z.string().min(1),
  /** Descripción compartible, p. ej. «remito aportado: 12 cajas». */
  description: z.string().min(1),
});

/** Advertencia compartible: usa alias locales, no ids privados de mensajes/evidencias (SH-02). */
export const SharedWarningSchema = z.strictObject({
  id: IdSchema,
  message: z.string().min(1),
  /** Aun `critical` nunca bloquea confirmar ni finalizar. */
  severity: z.enum(["warning", "critical"]),
  sources: z.array(SourceAliasSchema),
});

/** Contenido congelado compartido por todos los seleccionados (preimage del hash del snapshot). */
export const FrozenOperationSchema = z.strictObject({
  operation: OperationContentSchema,
  warnings: z.array(SharedWarningSchema),
  selection: ParticipantSelectionSchema,
});

export const SnapshotSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  snapshotId: IdSchema,
  revisionId: IdSchema,
  documentId: IdSchema,
  content: FrozenOperationSchema,
  /** SHA-256 de la serialización canónica de `content` (la calcula el consumidor, MVP-012/070). */
  snapshotHash: Sha256HexSchema,
  frozenAt: InstantSchema,
});

export const RevisionSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  revisionId: IdSchema,
  documentId: IdSchema,
  snapshotId: IdSchema,
  snapshotHash: Sha256HexSchema,
  selection: ParticipantSelectionSchema,
  /** `draftRevision` del que se congeló. */
  frozenFromDraftRevision: z.number().int().nonnegative(),
  /** Revisión a la que sustituye, si la hay; no hereda sus confirmaciones. */
  supersedesRevisionId: IdSchema.nullable(),
  documentStatus: DocumentStatusSchema,
  controlStatus: ControlStatusSchema,
  confirmationStatus: ConfirmationStatusSchema,
  createdAt: InstantSchema,
});

export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;
export type ThirdPartyRole = z.infer<typeof ThirdPartyRoleSchema>;
export type ParticipantSelection = z.infer<typeof ParticipantSelectionSchema>;
export type SourceAlias = z.infer<typeof SourceAliasSchema>;
export type SharedWarning = z.infer<typeof SharedWarningSchema>;
export type FrozenOperation = z.infer<typeof FrozenOperationSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Revision = z.infer<typeof RevisionSchema>;

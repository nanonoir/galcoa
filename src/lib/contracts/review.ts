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

/**
 * Selección de escritura nueva (F-2): proveedor (`autor`) y comprador obligatorios; transportista
 * (`intermediario`) opcional. Los IDs internos no cambian; solo las etiquetas de presentación.
 */
export const AlcSelectionSchema = z.union([
  z.tuple([z.literal("autor"), z.literal("comprador")]),
  z.tuple([z.literal("autor"), z.literal("intermediario"), z.literal("comprador")]),
]);

const AlcRuleIdSchema = z.enum([
  "ALC-CONTRADICCION", "ALC-NO-LECTURA", "ALC-AMBIGUEDAD", "ALC-DATO-DECLARADO", "ALC-FUENTES-COINCIDENTES",
  "ALC-PARTICIPANTES", "ALC-CONFIRMACIONES",
]);

/**
 * Estado de cada dato material: `declarado` = solo lo afirma el chat o una fuente no probatoria;
 * `confirmado` = respaldado por un original conservado; `contradicho`/`ambiguo` = rojo.
 */
export const AlcClaimStatusSchema = z.enum(["declarado", "confirmado", "contradicho", "ambiguo"]);

/** Resumen compartible del veredicto ALC: alias locales, sin ids ni rutas privadas. */
export const AlcSharedSchema = z.strictObject({
  rulesVersion: z.string().min(1),
  color: z.enum(["verde", "amarillo", "rojo"]),
  /** Compromiso al insumo exacto evaluado (SHA-256 JCS); no revela el contenido. */
  inputHash: Sha256HexSchema,
  findings: z.array(z.strictObject({ ruleId: AlcRuleIdSchema, claimId: z.string().nullable(), sources: z.array(z.string()) })),
  claims: z.array(z.strictObject({
    id: z.string().min(1), subject: z.string().min(1), field: z.string().min(1), value: z.string().min(1),
    unit: z.string().nullable(), status: AlcClaimStatusSchema,
  })),
});

/** Rectificación trazable: conserva el valor y las fuentes originales y exige una revisión nueva. */
export const RectificationSchema = z.strictObject({
  claimId: z.string().min(1),
  previousValue: z.string().min(1),
  correctedValue: z.string().min(1),
  reason: z.string().min(1),
  originalSources: z.array(z.string()),
  correctedSources: z.array(z.string()),
});

/** Contenido congelado v2: el v1 más la evaluación ALC y las rectificaciones. */
export const FrozenOperationV2Schema = z.strictObject({
  operation: OperationContentSchema,
  warnings: z.array(SharedWarningSchema),
  selection: AlcSelectionSchema,
  alc: AlcSharedSchema,
  rectifications: z.array(RectificationSchema),
});

/** Lector explícito v1/v2: los snapshots históricos siguen siendo válidos y no se reinterpretan. */
export const FrozenContentSchema = z.union([FrozenOperationSchema, FrozenOperationV2Schema]);

const SnapshotBase = {
  snapshotId: IdSchema,
  revisionId: IdSchema,
  documentId: IdSchema,
  /** SHA-256 de la serialización canónica de `content` (la calcula el consumidor, MVP-012/070). */
  snapshotHash: Sha256HexSchema,
  frozenAt: InstantSchema,
};

export const SnapshotSchema = z.discriminatedUnion("schemaVersion", [
  z.strictObject({ ...SnapshotBase, schemaVersion: SchemaVersionSchema, content: FrozenOperationSchema }),
  z.strictObject({ ...SnapshotBase, schemaVersion: z.literal(2), content: FrozenOperationV2Schema }),
]);
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
export type FrozenOperationV2 = z.infer<typeof FrozenOperationV2Schema>;
export type FrozenContent = z.infer<typeof FrozenContentSchema>;
export type AlcShared = z.infer<typeof AlcSharedSchema>;
export type Rectification = z.infer<typeof RectificationSchema>;
export type AlcSelection = z.infer<typeof AlcSelectionSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Revision = z.infer<typeof RevisionSchema>;

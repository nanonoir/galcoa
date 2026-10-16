import { z } from "zod";

import { IdSchema, InstantSchema, SchemaVersionSchema, Sha256HexSchema } from "./common";
import { ConfirmationStatusSchema } from "./document";
import { ThirdPartyRoleSchema } from "./review";

/**
 * Comandos y resultados de confirmación (MVP-021; INV-11–14; SH-04).
 * Confirmar exige casilla marcada; rechazar exige casilla desmarcada y
 * ratificación en modal (no conformidad). Toda respuesta de tercero conserva
 * su nombre autodeclarado, también el rechazo (decisión local: INV-13).
 * El nombre autodeclarado no es identidad verificada ni firma digital.
 */

/** Clave de idempotencia acotada al actor/recurso/acción (SH-04). */
export const IdempotencyKeySchema = z.string().min(8).max(128);

/** Revisión y snapshot exactos que la persona vio; el servidor revalida siempre. */
const ReviewTargetShape = {
  schemaVersion: SchemaVersionSchema,
  revisionId: IdSchema,
  snapshotId: IdSchema,
  snapshotHash: Sha256HexSchema,
  idempotencyKey: IdempotencyKeySchema,
};

const declaredName = z.string().trim().min(1);

const confirmShape = { decision: z.literal("confirmar"), checkboxChecked: z.literal(true) };
const rejectShape = {
  decision: z.literal("rechazar"),
  checkboxChecked: z.literal(false),
  /** Ratificación del modal; cancelar el modal no envía ningún comando. */
  rejectionRatified: z.literal(true),
};

/** El autor actúa desde su sesión (sin token). */
const authorShape = { actor: z.literal("autor"), documentId: IdSchema };
/** El tercero actúa con el token del enlace (capacidad, no sesión). */
const thirdPartyShape = {
  actor: z.literal("tercero"),
  token: z.string().min(1),
  declaredName,
};

export const ConfirmationCommandSchema = z.union([
  z.strictObject({ ...ReviewTargetShape, ...authorShape, ...confirmShape }),
  z.strictObject({ ...ReviewTargetShape, ...authorShape, ...rejectShape }),
  z.strictObject({ ...ReviewTargetShape, ...thirdPartyShape, ...confirmShape }),
  z.strictObject({ ...ReviewTargetShape, ...thirdPartyShape, ...rejectShape }),
]);

const resultBase = {
  schemaVersion: SchemaVersionSchema,
  responseId: IdSchema,
  revisionId: IdSchema,
  snapshotId: IdSchema,
  snapshotHash: Sha256HexSchema,
  /** Tiempo del servidor. */
  respondedAt: InstantSchema,
  /** `true` si es el resultado persistido de un comando repetido (idempotencia). */
  replayed: z.boolean(),
  /** Agregado de la revisión tras la respuesta. */
  confirmationStatus: ConfirmationStatusSchema,
};

const resultActor = z.union([
  z.strictObject({ role: z.literal("autor"), declaredName: z.null() }),
  z.strictObject({ role: ThirdPartyRoleSchema, declaredName }),
]);

const resultDecision = z.union([
  z.strictObject({ ...confirmShape }),
  z.strictObject({ ...rejectShape }),
]);

export const ConfirmationResultSchema = z
  .strictObject({
    ...resultBase,
    actor: resultActor,
    outcome: resultDecision,
  });

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type ConfirmationCommand = z.infer<typeof ConfirmationCommandSchema>;
export type ConfirmationResult = z.infer<typeof ConfirmationResultSchema>;

import { z } from "zod";

import { IdSchema, SchemaVersionSchema } from "./common";

/**
 * Envelope de resultados técnicos (MVP-021; SH-02/03). Distingue éxito persistido,
 * operación en curso y error técnico estable. Una advertencia no es un error:
 * los impedimentos de etapa se informan aquí, nunca se simula éxito.
 * `operationId` es solo una referencia; su máquina de estados es de MVP-080.
 */

export const TechnicalStageSchema = z.enum([
  "autenticacion",
  "validacion",
  "persistencia",
  "ia",
  "congelado",
  "confirmacion",
  "finalizacion",
  "pdf",
  "hcs",
  "verificacion",
]);

export const TechnicalErrorSchema = z.strictObject({
  /** Código estable (p. ej. `TOKEN_INVALIDO`); no contiene datos privados ni tokens. */
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  stage: TechnicalStageSchema,
  retryable: z.boolean(),
  /** Correlación no sensible para soporte. */
  correlationId: IdSchema,
});

export const OperationInProgressSchema = z.strictObject({
  operationId: IdSchema,
  stage: TechnicalStageSchema,
});

/** Envelope genérico: `data` es un DTO ya validado por su propio esquema. */
export function technicalEnvelope<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("status", [
    z.strictObject({ schemaVersion: SchemaVersionSchema, status: z.literal("persisted"), data }),
    z.strictObject({
      schemaVersion: SchemaVersionSchema,
      status: z.literal("in_progress"),
      operation: OperationInProgressSchema,
    }),
    z.strictObject({
      schemaVersion: SchemaVersionSchema,
      status: z.literal("error"),
      error: TechnicalErrorSchema,
    }),
  ]);
}

export type TechnicalStage = z.infer<typeof TechnicalStageSchema>;
export type TechnicalError = z.infer<typeof TechnicalErrorSchema>;
export type OperationInProgress = z.infer<typeof OperationInProgressSchema>;
export type TechnicalEnvelope<T> =
  | { schemaVersion: 1; status: "persisted"; data: T }
  | { schemaVersion: 1; status: "in_progress"; operation: OperationInProgress }
  | { schemaVersion: 1; status: "error"; error: TechnicalError };

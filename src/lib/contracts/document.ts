import { z } from "zod";

/**
 * DTO de resumen de documento (PRD §5). Solo JSON: fechas como string ISO 8601,
 * sin Date, SDK, entorno ni React. Cada dimensión de estado es independiente
 * y ninguna se deriva de otra.
 */

export const DocumentStatusSchema = z.enum([
  "borrador",
  "listo_para_revision",
  "esperando_confirmaciones",
  "revision_rechazada",
  "revision_sustituida",
  "finalizado",
]);

export const ControlStatusSchema = z.enum([
  "sin_evaluar",
  "con_advertencias",
  "contradiccion_critica",
  "sin_inconsistencias_criticas_detectadas",
]);

export const ConfirmationStatusSchema = z.enum([
  "pendiente",
  "parcial",
  "completa",
  "rechazada",
  "sustituida",
]);

export const HcsStatusSchema = z.enum([
  "no_iniciado",
  "pendiente",
  "registrado",
  "fallido",
]);

/** Advertencia informativa: aun `critical` nunca bloquea confirmar ni finalizar. */
export const DocumentWarningSchema = z.strictObject({
  id: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["warning", "critical"]),
  /** Referencias a las fuentes (mensajes o evidencias) que originan la advertencia. */
  sources: z.array(z.string().min(1)),
});

export const DocumentSummarySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  documentStatus: DocumentStatusSchema,
  controlStatus: ControlStatusSchema,
  /**
   * Estado de confirmaciones de la revisión congelada. `null` mientras no
   * exista una revisión congelada (p. ej. borrador): no se inventa un valor.
   */
  confirmationStatus: ConfirmationStatusSchema.nullable(),
  hcsStatus: HcsStatusSchema,
  /**
   * Revisión/snapshot a los que se refieren los estados anteriores, para no
   * mostrar autoridad engañosa. `null` si aún no hay revisión congelada.
   */
  revisionId: z.string().min(1).nullable(),
  snapshotId: z.string().min(1).nullable(),
  /** ISO 8601 con zona (UTC, sufijo `Z`). */
  updatedAt: z.iso.datetime(),
  warnings: z.array(DocumentWarningSchema),
});

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export type ControlStatus = z.infer<typeof ControlStatusSchema>;
export type ConfirmationStatus = z.infer<typeof ConfirmationStatusSchema>;
export type HcsStatus = z.infer<typeof HcsStatusSchema>;
export type DocumentWarning = z.infer<typeof DocumentWarningSchema>;
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

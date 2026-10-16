import "server-only";

import { z } from "zod";

/**
 * Salida estructurada del Agente 1 (MVP-051; sources-and-ai §2). Zod acredita
 * la forma, no la verdad: la procedencia se verifica aparte, de forma
 * determinista (`provenance.ts`).
 */

const Ref = z.string().regex(/^[me]\d{1,3}$/);

export const DraftFactSchema = z.strictObject({
  field: z.string().min(1),
  value: z.string().min(1),
  sourceRef: Ref,
  /** Cita textual de la fuente que respalda el valor. */
  quote: z.string().min(1),
});

export const DraftCorrectionSchema = z.strictObject({
  original: z.string().min(1),
  corrected: z.string().min(1),
  kind: z.enum(["ortografia", "formato", "estructura"]),
  sourceRef: Ref,
});

export const DraftModelWarningSchema = z.strictObject({
  message: z.string().min(1),
  severity: z.enum(["warning", "critical"]),
  sourceRefs: z.array(Ref).min(1),
});

export const DraftOutputSchema = z.strictObject({
  title: z.string().min(1),
  body: z.string().min(1),
  facts: z.array(DraftFactSchema),
  corrections: z.array(DraftCorrectionSchema),
  /** Datos que las fuentes no informan: se muestran como «no informado». */
  notInformed: z.array(z.string().min(1)),
  warnings: z.array(DraftModelWarningSchema),
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;
export type DraftModelWarning = z.infer<typeof DraftModelWarningSchema>;

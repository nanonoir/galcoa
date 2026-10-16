import { z } from "zod";

import { IdSchema, InstantSchema, Sha256HexSchema } from "./common";
import {
  ConfirmationStatusSchema,
  ControlStatusSchema,
  DocumentStatusSchema,
  HcsStatusSchema,
} from "./document";

/**
 * Núcleo documental privado (MVP-020; PRD §5, §8; SH-01, SH-03). Estas
 * entidades son del propietario: nunca se proyectan tal cual a un DTO público.
 */

/**
 * Fecha declarada del hecho (INV-09). Conserva el texto original y su
 * precisión; el instante solo existe si hay hora y zona suficientes. Una fecha
 * desconocida es explícita: la fecha de carga del servidor jamás la sustituye.
 */
export const DeclaredEventDateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unknown") }),
  z.strictObject({
    kind: z.literal("declared"),
    originalText: z.string().min(1),
    precision: z.enum(["year", "month", "day", "datetime"]),
    /** Zona declarada (p. ej. `America/Argentina/Buenos_Aires` o `-03:00`); `null` si no se informó. */
    timeZone: z.string().min(1).nullable(),
    /** Solo si `precision` es `datetime` y hay zona; nunca se completa por inferencia. */
    instant: InstantSchema.nullable(),
  }).refine(
    (d) => d.instant === null || (d.precision === "datetime" && d.timeZone !== null),
    { message: "El instante exige precisión datetime y zona declarada", path: ["instant"] },
  ),
]);

/** Contenido de operación redactado (compartible tras congelar; revisión y borrador lo reutilizan). */
export const OperationContentSchema = z.strictObject({
  title: z.string().min(1),
  /** Texto legible completo del documento. */
  body: z.string().min(1),
  /** Correcciones inocuas aplicadas (ortografía/formato), visibles al revisar. */
  corrections: z.array(z.string().min(1)),
});

export const DocumentRecordSchema = z.strictObject({
  documentId: IdSchema,
  ownerId: IdSchema,
  title: z.string().min(1),
  documentStatus: DocumentStatusSchema,
  controlStatus: ControlStatusSchema,
  confirmationStatus: ConfirmationStatusSchema.nullable(),
  hcsStatus: HcsStatusSchema,
  /** Revisión activa; `null` mientras no exista una congelada. */
  activeRevisionId: IdSchema.nullable(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

export const MessageSchema = z.strictObject({
  messageId: IdSchema,
  documentId: IdSchema,
  sender: z.enum(["autor", "agente"]),
  /** Texto original conservado sin modificar. */
  content: z.string().min(1),
  declaredEventDate: DeclaredEventDateSchema,
  /** Fecha real de carga, fijada por el servidor (distinta de la declarada). */
  uploadedAt: InstantSchema,
});

export const EvidenceExtractionSchema = z.strictObject({
  extractionId: IdSchema,
  /** Proveedor/método de extracción (registro distinto del original). */
  method: z.string().min(1),
  /** Página (1-based) cuando exista. */
  page: z.number().int().positive().nullable(),
  text: z.string(),
  extractedAt: InstantSchema,
});

export const EvidenceSchema = z.strictObject({
  evidenceId: IdSchema,
  documentId: IdSchema,
  messageId: IdSchema.nullable(),
  kind: z.enum(["texto", "pdf", "imagen"]),
  mimeType: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  /** Hash de los bytes originales. */
  sha256: Sha256HexSchema,
  /** Ubicación en almacenamiento privado; nunca se expone en DTO públicos. */
  privateLocation: z.string().min(1),
  declaredEventDate: DeclaredEventDateSchema,
  uploadedAt: InstantSchema,
  extractions: z.array(EvidenceExtractionSchema),
});

export const DraftSchema = z.strictObject({
  draftId: IdSchema,
  documentId: IdSchema,
  /** Contador de concurrencia: congelar comprueba el valor esperado (SH-01). */
  draftRevision: z.number().int().nonnegative(),
  content: OperationContentSchema,
  updatedAt: InstantSchema,
});

export type DeclaredEventDate = z.infer<typeof DeclaredEventDateSchema>;
export type OperationContent = z.infer<typeof OperationContentSchema>;
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type EvidenceExtraction = z.infer<typeof EvidenceExtractionSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Draft = z.infer<typeof DraftSchema>;

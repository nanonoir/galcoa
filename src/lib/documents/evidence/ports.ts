import "server-only";

import type { DeclaredEventDate } from "@/lib/contracts/core";

import type { AuditContext, IdempotencyInput } from "../ports";

/**
 * Puertos de evidencias (MVP-042/043). Los servicios dependen de estas
 * interfaces, no de Supabase. El adaptador de filas (tablas `evidences` y
 * `evidence_extractions` de la migración C1, con RPC atómicas de F4) y el de
 * Storage (bucket `evidences-private` de MVP-024) se conectan en persistence.ts
 * y storage.ts. La DB impone la vigencia de carga autenticada de 120 s.
 */

/** Fila de evidencia del propietario. `reserved` aún no cuenta como original conservado. */
export type StoredEvidence = {
  evidenceId: string;
  documentId: string;
  kind: "texto" | "pdf" | "imagen";
  mimeType: string;
  byteLength: number;
  /** SHA-256 declarado al reservar; al aceptar coincide con el de los bytes subidos. */
  sha256: string;
  /** Clave opaca en el bucket privado; jamás se expone fuera del servidor. */
  privateLocation: string;
  uploadState: "reserved" | "accepted";
  declaredEventDate: DeclaredEventDate;
  /** Tiempo del servidor de base. */
  uploadedAt: string;
  acceptedAt: string | null;
  /** Vencimiento impuesto por la DB para INSERT directo autenticado. */
  uploadExpiresAt: string;
  /** Claim terminal del servidor; nunca se expone como parte del resumen público. */
  cleanupClaimedAt: string | null;
};

export type ReserveEvidenceInput = {
  ownerId: string;
  documentId: string;
  kind: "pdf" | "imagen";
  mimeType: string;
  byteLength: number;
  sha256: string;
  privateLocation: string;
  declaredEventDate: DeclaredEventDate;
  /**
   * Topes acumulados por documento. La RPC los comprueba bajo lock del
   * documento, contando todas las reservas retenidas y aceptadas: dos cargas simultáneas
   * no pueden excederlos.
   */
  limits: { maxFiles: number; maxTotalBytes: number };
  idempotency: IdempotencyInput;
};

export type ReserveEvidenceResult =
  | { status: "reserved" | "replayed"; evidence: StoredEvidence }
  | { status: "limit_exceeded"; limit: "files" | "total_bytes" }
  | { status: "idempotency_conflict" }
  | { status: "not_available" }
  | { status: "discard_pending" };

export type StoredExtraction = {
  extractionId: string;
  documentId: string;
  evidenceId: string;
  /** `directo` (texto sin IA) o `gemini`. */
  method: string;
  model: string | null;
  promptVersion: string | null;
  /** Páginas (1-based) cubiertas, cuando el proveedor las informa. */
  pages: number[] | null;
  text: string;
  limitations: string[];
  /** Tiempo del servidor de base. */
  extractedAt: string;
};

export type AppendExtractionInput = Omit<StoredExtraction, "extractionId" | "extractedAt"> & {
  ownerId: string;
  audit: AuditContext;
};

/**
 * Persistencia de evidencias y extracciones. Lecturas filtradas por
 * propietario: ajeno e inexistente devuelven lo mismo (`null`). Un original
 * aceptado no se modifica ni se borra; solo una reserva no aceptada se descarta.
 * Las extracciones son de solo agregar: un reintento crea otra fila.
 */
export type EvidenceStore = {
  reserveEvidence(input: ReserveEvidenceInput): Promise<ReserveEvidenceResult>;
  getEvidence(ownerId: string, documentId: string, evidenceId: string): Promise<StoredEvidence | null>;
  listEvidences(ownerId: string, documentId: string): Promise<StoredEvidence[] | null>;
  /** Promueve la reserva a original conservado y audita en la misma transacción. */
  acceptEvidence(input: { ownerId: string; evidenceId: string; audit: AuditContext }): Promise<StoredEvidence | null>;
  /** Finaliza un descarte reclamado tras confirmar el borrado en Storage. */
  discardReservation(input: { ownerId: string; evidenceId: string }): Promise<void>;
  /** Lote acotado propio; no lista objetos de Storage ni acepta rutas del cliente. */
  listDiscards(ownerId: string): Promise<StoredEvidence[]>;
  /** Irreversible; rejected solo se decide tras inspección técnica del servidor. */
  claimDiscard(ownerId: string, evidenceId: string, rejected: boolean): Promise<StoredEvidence | null>;
  appendExtraction(input: AppendExtractionInput): Promise<StoredExtraction>;
  listExtractions(ownerId: string, documentId: string): Promise<StoredExtraction[] | null>;
};

/** Storage privado (bucket `evidences-private`). Sin URLs públicas ni sobrescritura. */
export type EvidenceStorage = {
  /** Carga estándar autenticada: ruta fija reservada en DB, sin token firmado ni upsert. */
  authorizeDirectUpload(
    privateLocation: string,
    options: { contentType: string; maxBytes: number; expiresAt: string },
  ): Promise<DirectUploadPermit>;
  /** Bytes del objeto, o `null` si todavía no se subió. */
  download(privateLocation: string): Promise<Uint8Array | null>;
  /** Solo para objetos rechazados que ninguna fila aceptada referencia. */
  remove(privateLocation: string): Promise<void>;
  /** Lectura breve para el propietario. */
  createSignedRead(privateLocation: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: string }>;
};

export type DirectUploadPermit = {
  transport: "authenticated";
  bucket: "evidences-private";
  objectPath: string;
  contentType: string;
  maxBytes: number;
  expiresAt: string;
};

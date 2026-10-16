import "server-only";

import { z } from "zod";

import type { DocumentRecord } from "@/lib/contracts/core";
import { DocumentSummarySchema, type DocumentSummary } from "@/lib/contracts/document";

import type { DocumentStore, SessionPort } from "./ports";
import {
  commandFingerprint,
  failure,
  IDEMPOTENCY_KEY_PATTERN,
  newId,
  type ServiceDeps,
  type ServiceResult,
} from "./result";

/**
 * Servicio de documentos del propietario (MVP-040; REQ-01/02, INV-11, SH-07).
 * Cada operación valida la sesión en el servidor además de RLS. Los estados se
 * devuelven tal como están persistidos: no se deriva «aprobado» (MVP-060).
 * Server Components lo consumen directo, sin HTTP propio.
 */

export const CreateDocumentCommandSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
});

export type CreateDocumentCommand = z.infer<typeof CreateDocumentCommandSchema>;

/**
 * Proyección del registro persistido al resumen del dashboard (SH-02, sin
 * `schemaVersion` retroactivo). Sin revisión activa, las dimensiones de
 * revisión van en `null`. El snapshot lo aporta MVP-070 al congelar; las
 * advertencias, el motor de MVP-060.
 */
export function toDocumentSummary(record: DocumentRecord): DocumentSummary {
  const hasRevision = record.activeRevisionId !== null;
  return DocumentSummarySchema.parse({
    id: record.documentId,
    title: record.title,
    documentStatus: record.documentStatus,
    controlStatus: record.controlStatus,
    confirmationStatus: hasRevision ? record.confirmationStatus : null,
    hcsStatus: record.hcsStatus,
    revisionId: record.activeRevisionId,
    snapshotId: null,
    updatedAt: record.updatedAt,
    warnings: [],
  });
}

export function createDocumentService(session: SessionPort, store: DocumentStore, deps: ServiceDeps = {}) {
  const correlation = deps.newCorrelationId ?? newId;

  async function requireUser(correlationId: string) {
    const userId = await session.currentUserId();
    return userId ? { userId } : failure("NO_SESSION", "autenticacion", false, correlationId);
  }

  return {
    async createDocument(command: unknown): Promise<ServiceResult<DocumentSummary>> {
      const correlationId = correlation();
      const auth = await requireUser(correlationId);
      if (!("userId" in auth)) return auth;

      const parsed = CreateDocumentCommandSchema.safeParse(command);
      if (!parsed.success) return failure("INVALID_INPUT", "validacion", false, correlationId);
      const { title, idempotencyKey } = parsed.data;

      try {
        const result = await store.createDocument({
          ownerId: auth.userId,
          title,
          idempotency: {
            key: idempotencyKey,
            fingerprint: commandFingerprint({ schemaVersion: 1, action: "document.create", title }),
          },
          audit: { actorScope: auth.userId, correlationId },
        });
        if (result.status === "idempotency_conflict") {
          return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
        }
        if (result.status === "not_available") return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return { ok: true, value: toDocumentSummary(result.value), replayed: result.status === "replayed" };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    async listDocuments(): Promise<ServiceResult<DocumentSummary[]>> {
      const correlationId = correlation();
      const auth = await requireUser(correlationId);
      if (!("userId" in auth)) return auth;
      try {
        const records = await store.listDocuments(auth.userId);
        return { ok: true, value: records.map(toDocumentSummary) };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    async getDocument(documentId: string): Promise<ServiceResult<DocumentSummary>> {
      const correlationId = correlation();
      const auth = await requireUser(correlationId);
      if (!("userId" in auth)) return auth;
      if (typeof documentId !== "string" || documentId === "") {
        return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
      }
      try {
        const record = await store.getDocument(auth.userId, documentId);
        // Ajeno o inexistente: misma respuesta, sin revelar existencia.
        if (!record) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return { ok: true, value: toDocumentSummary(record) };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}

import "server-only";

import { z } from "zod";

import { DeclaredEventDateSchema } from "@/lib/contracts/core";
import type { DocumentRpc } from "../persistence/store";
import type { EvidenceStore } from "./ports";

export const StoredEvidenceSchema = z.strictObject({
  evidenceId: z.uuid(), documentId: z.uuid(), kind: z.enum(["texto", "pdf", "imagen"]),
  mimeType: z.string(), byteLength: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  privateLocation: z.string().min(1), uploadState: z.enum(["reserved", "accepted"]),
  declaredEventDate: DeclaredEventDateSchema, uploadedAt: z.string(), acceptedAt: z.string().nullable(),
  uploadExpiresAt: z.string(),
  cleanupClaimedAt: z.string().nullable(),
});
const extraction = z.strictObject({
  extractionId: z.uuid(), documentId: z.uuid(), evidenceId: z.uuid(), method: z.string(),
  model: z.string().nullable(), promptVersion: z.string().nullable(), pages: z.array(z.number().int().positive()).nullable(),
  text: z.string(), limitations: z.array(z.string()), extractedAt: z.string(),
});
const reservation = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["reserved", "replayed"]), evidence: StoredEvidenceSchema }),
  z.strictObject({ status: z.literal("limit_exceeded"), limit: z.enum(["files", "total_bytes"]) }),
  z.strictObject({ status: z.literal("idempotency_conflict") }),
  z.strictObject({ status: z.literal("not_available") }),
  z.strictObject({ status: z.literal("discard_pending") }),
]);

/** Solo después de Auth.getUser. El transporte debe ser el ejecutor, no service_role. */
export function createEvidenceStore(context: { verifiedUserId: string; executor: DocumentRpc }): EvidenceStore {
  function actor(owner: string) {
    if (!owner || owner !== context.verifiedUserId) throw new Error("Operación no autorizada");
  }
  async function call(owner: string, name: string, args: Record<string, unknown>) {
    actor(owner);
    const { data, error } = await context.executor.rpc(name, { p_actor_id: owner, ...args });
    if (error) throw new Error("Persistencia de evidencias no disponible");
    return data;
  }
  function sameDocument<T extends { documentId: string }>(row: T, id: string): T {
    if (row.documentId !== id) throw new Error("Respuesta de persistencia inválida");
    return row;
  }
  return {
    async reserveEvidence(i) {
      if (i.limits.maxFiles !== 3 || i.limits.maxTotalBytes !== 20971520) throw new Error("Límites incompatibles");
      const result = reservation.parse(await call(i.ownerId, "reserve_evidence", {
        p_document_id: i.documentId, p_kind: i.kind, p_mime_type: i.mimeType, p_byte_length: i.byteLength,
        p_sha256: i.sha256, p_private_location: i.privateLocation, p_declared_event_date: i.declaredEventDate,
        p_key: i.idempotency.key, p_fingerprint: i.idempotency.fingerprint,
      }));
      if ("evidence" in result) sameDocument(result.evidence, i.documentId);
      return result;
    },
    async getEvidence(owner, doc, id) {
      const row = StoredEvidenceSchema.nullable().parse(await call(owner, "get_evidence", { p_document_id: doc, p_evidence_id: id }));
      if (row && (row.evidenceId !== id || row.documentId !== doc)) throw new Error("Respuesta de persistencia inválida");
      return row;
    },
    async listEvidences(owner, doc) {
      return z.array(StoredEvidenceSchema).nullable().parse(await call(owner, "list_evidences", { p_document_id: doc }))?.map((r) => sameDocument(r, doc)) ?? null;
    },
    async acceptEvidence(i) {
      actor(i.audit.actorScope);
      const row = StoredEvidenceSchema.nullable().parse(await call(i.ownerId, "accept_evidence", { p_evidence_id: i.evidenceId, p_correlation_id: i.audit.correlationId }));
      if (row && row.evidenceId !== i.evidenceId) throw new Error("Respuesta de persistencia inválida");
      return row;
    },
    async discardReservation(i) { await call(i.ownerId, "discard_evidence_reservation", { p_evidence_id: i.evidenceId }); },
    async listDiscards(owner) {
      return z.array(StoredEvidenceSchema).max(3).parse(await call(owner, "list_evidence_discards", {}));
    },
    async claimDiscard(owner, id, rejected) {
      const row = StoredEvidenceSchema.nullable().parse(await call(owner, "claim_evidence_discard", { p_evidence_id: id, p_rejected: rejected }));
      if (row && (row.evidenceId !== id || row.uploadState !== "reserved" || !row.cleanupClaimedAt)) throw new Error("Descarte no autorizado");
      return row;
    },
    async appendExtraction(i) {
      actor(i.audit.actorScope);
      const row = extraction.parse(await call(i.ownerId, "append_evidence_extraction", {
        p_document_id: i.documentId, p_evidence_id: i.evidenceId, p_method: i.method, p_model: i.model,
        p_prompt_version: i.promptVersion, p_pages: i.pages, p_text: i.text, p_limitations: JSON.stringify(i.limitations), p_correlation_id: i.audit.correlationId,
      }));
      if (row.evidenceId !== i.evidenceId) throw new Error("Respuesta de persistencia inválida");
      return sameDocument(row, i.documentId);
    },
    async listExtractions(owner, doc) {
      return z.array(extraction).nullable().parse(await call(owner, "list_evidence_extractions", { p_document_id: doc }))?.map((r) => sameDocument(r, doc)) ?? null;
    },
  };
}

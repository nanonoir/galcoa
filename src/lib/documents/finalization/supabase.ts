import "server-only";

import { z } from "zod";

import type { DocumentRpc } from "../persistence/store";

import { PHASES } from "./phases";

/**
 * Adaptador de `claim_finalization` (MVP-080). EXECUTE es solo de `authenticated`: va con la sesión
 * verificada del propietario y la identidad la fija `auth.uid()` en la base (nunca un argumento).
 * La respuesta se valida con esquemas cerrados; un error de SDK/SQL no cruza la frontera.
 * `fencing` solo existe para quien reclama o reanuda: es del servidor y no se proyecta al cliente.
 */

const Uuid = z.uuid();
const Operation = z.strictObject({
  operationId: Uuid, revisionId: Uuid, snapshotId: Uuid, snapshotHash: z.string().min(1), versionId: Uuid,
  versionNumber: z.number().int().positive(), previousVersionId: Uuid.nullable(), renderer: z.string().min(1).max(64),
  phase: z.enum(PHASES), status: z.enum(["active", "abandoned"]), leaseExpiresAt: z.string().min(1),
});
const Owned = Operation.extend({ fencing: z.number().int().positive() }).strict();

const ClaimResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["claimed", "resumed"]), operation: Owned }),
  z.strictObject({ status: z.enum(["in_progress", "published"]), operation: Operation }),
  z.strictObject({ status: z.enum(["rejected", "confirmations_missing", "revision_not_active", "draft_changed", "not_available"]) }),
  // Guarda ALC de SQL (claim y reanudación): denegación estructurada y auditada; no hay "aprobar igual".
  z.strictObject({ status: z.literal("blocked"), code: z.enum(["evaluation_required", "stale_evaluation", "selection_invalid", "red"]) }),
]);

export type ClaimResult = z.infer<typeof ClaimResultSchema>;
export type ClaimInput = { documentId: string; revisionId: string; renderer: string; leaseSeconds: number; correlationId: string };
export type FinalizationClaimStore = { claim(input: ClaimInput): Promise<ClaimResult> };

/** Lectura de estado: proyección mínima de `get_finalization_status`; nunca nonce, fencing, hashes ni versionId. */
const StatusResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("found"),
    operation: z.strictObject({ operationId: Uuid, phase: z.enum(PHASES), status: z.enum(["active", "abandoned"]), versionNumber: z.number().int().positive() }),
  }),
  z.strictObject({ status: z.enum(["no_operation", "not_available"]) }),
]);
export type FinalizationStatusResult = z.infer<typeof StatusResultSchema>;
export type FinalizationStatusStore = { status(input: { documentId: string; revisionId: string }): Promise<FinalizationStatusResult> };

export function createSupabaseFinalizationStatusStore(context: { verifiedUserId: string; session: DocumentRpc }): FinalizationStatusStore {
  return {
    async status(input) {
      if (!context.verifiedUserId) throw new Error("Operación no autorizada");
      const { data, error } = await context.session.rpc("get_finalization_status", { p_document_id: input.documentId, p_revision_id: input.revisionId });
      if (error) throw new Error("Persistencia no disponible");
      const parsed = StatusResultSchema.safeParse(data);
      if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
      return parsed.data;
    },
  };
}

export function createSupabaseFinalizationStore(context: { verifiedUserId: string; session: DocumentRpc }): FinalizationClaimStore {
  return {
    async claim(input) {
      if (!context.verifiedUserId) throw new Error("Operación no autorizada");
      const { data, error } = await context.session.rpc("claim_finalization", {
        p_document_id: input.documentId,
        p_revision_id: input.revisionId,
        p_renderer: input.renderer,
        p_lease_seconds: input.leaseSeconds,
        p_correlation_id: input.correlationId,
      });
      if (error) throw new Error("Persistencia no disponible");
      const parsed = ClaimResultSchema.safeParse(data);
      if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
      if ("operation" in parsed.data && parsed.data.operation.revisionId !== input.revisionId) throw new Error("Respuesta de persistencia inválida");
      return parsed.data;
    },
  };
}

import "server-only";

import { z } from "zod";

import { ParticipantSelectionSchema, RevisionSchema, SnapshotSchema } from "@/lib/contracts/review";

import type { DocumentRpc } from "../persistence/store";

import { FreezeSourceSchema, toFreezeSource } from "./freeze-source";
import type { FreezeReader, FreezeResult, RevisionBundle, RevisionStore } from "./ports";

/**
 * Adaptadores Supabase de revisiones (MVP-070/071). Cada operación es una RPC
 * con la sesión **verificada** del propietario: la identidad la fija
 * `auth.uid()` en la base y nunca viaja como argumento. Lo que vuelve se valida
 * con los esquemas del contrato; un error de SDK o SQL no cruza la frontera
 * (sale como «Persistencia no disponible»). Sin fallback en memoria.
 */

const Bundle = z.strictObject({ revision: RevisionSchema, snapshot: SnapshotSchema });
const Responses = z.array(z.strictObject({ role: z.enum(["autor", "intermediario", "comprador"]), response: z.enum(["confirmado", "rechazado"]), snapshotId: z.string(), respondedAt: z.string() }));

const FreezeResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("created"), value: Bundle, supersededRevisionId: z.string().nullable(), invalidatedInvitations: z.number().int().nonnegative() }),
  z.strictObject({ status: z.literal("replayed"), value: Bundle }),
  z.strictObject({ status: z.literal("unchanged"), value: Bundle }),
  z.strictObject({ status: z.enum(["stale_draft", "idempotency_conflict", "not_available"]) }),
]);

const AuthorResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.enum(["created", "replayed"]),
    response: z.strictObject({
      responseId: z.string(), revisionId: z.string(), snapshotId: z.string(), snapshotHash: z.string(),
      role: z.literal("autor"), decision: z.literal("confirmar"), declaredName: z.null(), respondedAt: z.string(),
    }),
    selection: ParticipantSelectionSchema,
    responses: Responses,
    snapshotId: z.string(),
  }),
  z.strictObject({ status: z.enum(["snapshot_mismatch", "revision_not_active", "already_responded", "idempotency_conflict", "not_available"]) }),
]);

export function createSupabaseRevisionAdapters(context: { verifiedUserId: string; session: DocumentRpc }): { store: RevisionStore; reader: FreezeReader } {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await context.session.rpc(name, args);
    if (error) throw new Error("Persistencia no disponible");
    return data;
  }
  function requireOwner(ownerId: string) {
    if (!ownerId || ownerId !== context.verifiedUserId) throw new Error("Operación no autorizada");
  }

  const reader: FreezeReader = {
    async getFreezeSource(ownerId, documentId) {
      requireOwner(ownerId);
      const raw = await call("get_freeze_source", { p_document_id: documentId });
      if (raw === null) return null;
      const source = FreezeSourceSchema.parse(raw);
      if (source.draft.documentId !== documentId) throw new Error("Respuesta de persistencia inválida");
      return toFreezeSource(source);
    },
  };

  const store: RevisionStore = {
    async freezeRevision(input) {
      requireOwner(input.ownerId);
      requireOwner(input.audit.actorScope);
      const result: FreezeResult = FreezeResultSchema.parse(
        await call("freeze_revision", {
          p_document_id: input.documentId,
          p_expected_draft_revision: input.expectedDraftRevision,
          p_canonical_hex: input.canonicalHex,
          p_control_status: input.controlStatus,
          p_sources: input.sources,
          p_key: input.idempotency.key,
          p_fingerprint: input.idempotency.fingerprint,
          p_correlation_id: input.audit.correlationId,
        }),
      );
      if ("value" in result) {
        const { revision, snapshot } = result.value;
        // La base recalcula el hash de los bytes canónicos: tiene que ser el que calculó el servicio.
        if (revision.documentId !== input.documentId || snapshot.snapshotHash !== input.snapshotHash || revision.snapshotHash !== input.snapshotHash) {
          throw new Error("Respuesta de persistencia inválida");
        }
      }
      return result;
    },
    async confirmAsAuthor(input) {
      requireOwner(input.ownerId);
      requireOwner(input.audit.actorScope);
      const result = AuthorResultSchema.parse(
        await call("confirm_as_author", {
          p_document_id: input.documentId,
          p_revision_id: input.revisionId,
          p_snapshot_id: input.snapshotId,
          p_snapshot_hash: input.snapshotHash,
          p_key: input.idempotency.key,
          p_fingerprint: input.idempotency.fingerprint,
          p_correlation_id: input.audit.correlationId,
        }),
      );
      if (result.status !== "created" && result.status !== "replayed") return result;
      return {
        status: result.status,
        response: result.response,
        selection: result.selection,
        snapshotId: result.snapshotId,
        responses: result.responses.map(({ role, response }) => ({ role, response })),
      };
    },
    async getActiveRevision(ownerId, documentId) {
      requireOwner(ownerId);
      const raw = await call("get_active_revision", { p_document_id: documentId });
      if (raw === null) return null;
      const bundle: RevisionBundle = Bundle.parse(raw);
      if (bundle.revision.documentId !== documentId) throw new Error("Respuesta de persistencia inválida");
      return bundle;
    },
  };

  return { store, reader };
}

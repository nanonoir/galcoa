import "server-only";

import { z } from "zod";

import { FrozenOperationSchema, ParticipantSelectionSchema, ThirdPartyRoleSchema } from "@/lib/contracts/review";
import { DeclaredNameSchema } from "@/lib/contracts/confirmation";

import type { DocumentRpc } from "../persistence/store";

import type { InvitationStore, IssueInvitationResult, RespondResult } from "./ports";

/**
 * Adaptadores Supabase de invitaciones (MVP-072/073/074).
 *
 * - Emisión y revocación (`issueInvitation`, `revokeInvitation`): sesión
 *   **verificada** del propietario; la identidad es `auth.uid()` en la base.
 * - Lectura y respuesta (`readByTokenHash`, `respondAtomically`): cliente
 *   **anónimo** por petición. La capacidad es el hash del token; el token en
 *   claro nunca llega a este módulo ni a la base.
 *
 * Lo que vuelve se valida con esquemas estrictos y los errores de SDK o SQL no
 * cruzan la frontera. Sin fallback en memoria.
 */

const Role = ThirdPartyRoleSchema;

const IssueSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("created"), invitationId: z.string(), revisionId: z.string(), role: Role,
    expiresAt: z.string(), revokedInvitationId: z.string().nullable(),
  }),
  z.strictObject({ status: z.literal("replayed"), invitationId: z.string() }),
  z.strictObject({ status: z.enum(["role_not_selected", "revision_not_active", "already_responded", "idempotency_conflict", "not_available"]) }),
]);

const ReadSchema = z.strictObject({
  invitationId: z.string(), revisionId: z.string(), snapshotId: z.string(), snapshotHash: z.string(), role: Role,
  selection: ParticipantSelectionSchema, content: FrozenOperationSchema,
  state: z.enum(["vigente", "consumida", "revocada", "vencida", "sustituida"]), expiresAt: z.string(),
});

const RespondSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.enum(["created", "replayed"]),
    response: z.strictObject({
      responseId: z.string(), revisionId: z.string(), snapshotId: z.string(), snapshotHash: z.string(), role: Role,
      decision: z.enum(["confirmar", "rechazar"]), declaredName: DeclaredNameSchema, respondedAt: z.string(),
    }),
    selection: ParticipantSelectionSchema,
    responses: z.array(z.strictObject({ role: z.enum(["autor", "intermediario", "comprador"]), response: z.enum(["confirmado", "rechazado"]), snapshotId: z.string(), respondedAt: z.string() })),
    snapshotId: z.string(),
  }),
  z.strictObject({ status: z.literal("unavailable"), state: z.enum(["consumida", "revocada", "vencida", "sustituida"]) }),
  z.strictObject({ status: z.enum(["snapshot_mismatch", "idempotency_conflict", "not_available"]) }),
]);

const RevokeSchema = z.strictObject({ status: z.enum(["revoked", "already_revoked", "not_available"]) });

export function createSupabaseInvitationStore(context: {
  /** Sesión verificada del propietario; `null` en el contexto público. */
  verifiedUserId: string | null;
  rpc: DocumentRpc;
}): InvitationStore {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await context.rpc.rpc(name, args);
    if (error) throw new Error("Persistencia no disponible");
    return data;
  }
  function requireOwner(ownerId: string) {
    if (!context.verifiedUserId || ownerId !== context.verifiedUserId) throw new Error("Operación no autorizada");
  }

  return {
    async issueInvitation(input) {
      requireOwner(input.ownerId);
      requireOwner(input.audit.actorScope);
      const result: IssueInvitationResult = IssueSchema.parse(
        await call("issue_invitation", {
          p_revision_id: input.revisionId,
          p_role: input.role,
          p_token_hash: input.tokenHash,
          p_ttl_seconds: input.ttlSeconds,
          p_key: input.idempotency.key,
          p_fingerprint: input.idempotency.fingerprint,
          p_correlation_id: input.audit.correlationId,
        }),
      );
      if (result.status === "created" && (result.revisionId !== input.revisionId || result.role !== input.role)) {
        throw new Error("Respuesta de persistencia inválida");
      }
      return result;
    },
    async revokeInvitation(input) {
      requireOwner(input.ownerId);
      return RevokeSchema.parse(await call("revoke_invitation", { p_invitation_id: input.invitationId, p_correlation_id: input.audit.correlationId }));
    },
    async readByTokenHash(tokenHash) {
      const raw = await call("read_invitation", { p_token_hash: tokenHash });
      return raw === null ? null : ReadSchema.parse(raw);
    },
    async respondAtomically(input) {
      const { command } = input;
      const result = RespondSchema.parse(
        await call("respond_invitation", {
          p_token_hash: input.tokenHash,
          p_revision_id: command.revisionId,
          p_snapshot_id: command.snapshotId,
          p_snapshot_hash: command.snapshotHash,
          p_decision: command.decision,
          p_declared_name: command.declaredName,
          p_key: input.idempotency.key,
          p_fingerprint: input.idempotency.fingerprint,
          p_correlation_id: input.audit.correlationId,
        }),
      );
      if (result.status !== "created" && result.status !== "replayed") return result as RespondResult;
      return {
        status: result.status,
        response: result.response,
        selection: result.selection,
        responses: result.responses.map(({ role, response }) => ({ role, response })),
      };
    },
  };
}

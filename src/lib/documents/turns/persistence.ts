import "server-only";

import { z } from "zod";

import { DraftSchema, MessageSchema, type Draft, type Message } from "@/lib/contracts/core";
import { InstantSchema } from "@/lib/contracts/common";

import type { DocumentRpc } from "../persistence/store";
import type { AuditContext } from "../ports";
import type { DraftInputRef, DraftStager } from "../drafting/ports";

import type { TurnClaimRef, TurnRecord } from "./ports";

export type { TurnClaimRef };

/**
 * Adaptador SQL de los turnos durables (migraciones 02500/02501; docs/design/durable-chat-turns.md).
 * Puerto único del servicio de turnos (`TurnStore` legacy retirado). No hay
 * auditoría TS de `chat_turn.*`: SQL la emite de forma atómica con cada transición.
 * Diferencia clave: `stageProposal` (`DraftStager`) NO devuelve un `Draft` oficial (solo
 * referencias de staging); `completeTurn` es el único punto que publica y devuelve el resultado original.
 */

export type DurableClaimResult =
  | { status: "claimed"; turn: TurnRecord; retried: boolean }
  | { status: "in_progress"; turn: TurnRecord }
  | { status: "completed"; turn: TurnRecord; agentMessage: Message }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

export type CompleteTurnResult =
  | { status: "completed" | "replayed"; turn: TurnRecord; draft: Draft; proposalId: string; agentMessage: Message }
  | { status: "stale" | "not_staged" | "user_message_required" | "document_finalized" | "stale_draft" | "not_available" };

export type DurableChatStore = DraftStager & {
  claimTurn(input: {
    ownerId: string;
    documentId: string;
    clientMessageId: string;
    fingerprint: string;
    leaseSeconds: number;
    audit: AuditContext;
  }): Promise<DurableClaimResult>;
  attachUserMessage(input: {
    ownerId: string;
    claim: TurnClaimRef;
    userMessageId: string;
    audit: AuditContext;
  }): Promise<{ status: "attached"; turn: TurnRecord } | { status: "stale" | "not_available" }>;
  completeTurn(input: { ownerId: string; claim: TurnClaimRef; agentContent: string; audit: AuditContext }): Promise<CompleteTurnResult>;
  closeAttempt(input: {
    ownerId: string;
    claim: TurnClaimRef;
    state: "fallido" | "cancelado";
    /** Código de dominio (p. ej. `AI_ABORTED`); se convierte con `toSqlErrorCode`. */
    errorCode: string;
    audit: AuditContext;
  }): Promise<{ status: "closed"; turn: TurnRecord } | { status: "stale" | "not_available" }>;
};

/** Error opaco: nunca conserva mensajes, SQL ni credenciales del proveedor. */
export class DurableChatError extends Error {
  constructor(readonly code: "NO_SESSION" | "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Persistencia de turnos no disponible");
  }
}

/**
 * SQL acepta `^[a-z0-9_]{1,64}$`; el dominio emite `AI_ABORTED` etc. La conversión es
 * solo minúsculas (inyectiva sobre códigos válidos); lo malformado cae a un código fijo.
 */
export function toSqlErrorCode(code: string): string {
  return /^[A-Za-z0-9_]{1,64}$/.test(code) ? code.toLowerCase() : "unknown_error";
}

const UUID = z.uuid();
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;

const TurnSchema = z
  .strictObject({
    turnId: UUID,
    documentId: UUID,
    clientMessageId: z.string().regex(CLIENT_MESSAGE_ID),
    attempt: z.number().int().min(1),
    state: z.enum(["en_curso", "completado", "fallido", "cancelado"]),
    userMessageId: UUID.nullable(),
    agentMessageId: UUID.nullable(),
    leaseExpiresAt: InstantSchema.nullable(),
  })
  .refine((t) => (t.state === "en_curso") === (t.leaseExpiresAt !== null) && (t.state !== "completado" || t.agentMessageId !== null));
const AgentMessageSchema = MessageSchema.refine((m) => m.sender === "agente");
const only = <S extends string>(...s: [S, ...S[]]) => z.strictObject({ status: z.enum(s) });

const claimSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("claimed"), turn: TurnSchema, retried: z.boolean() }),
  z.strictObject({ status: z.literal("in_progress"), turn: TurnSchema }),
  z.strictObject({ status: z.literal("completed"), turn: TurnSchema, agentMessage: AgentMessageSchema }),
  z.strictObject({ status: z.literal("idempotency_conflict") }),
  z.strictObject({ status: z.literal("not_available") }),
]);
const attachSchema = z.union([z.strictObject({ status: z.literal("attached"), turn: TurnSchema }), only("stale", "not_available")]);
const closeSchema = z.union([z.strictObject({ status: z.literal("closed"), turn: TurnSchema }), only("stale", "not_available")]);
const stageSchema = z.union([
  z.strictObject({
    status: z.literal("staged"),
    replayed: z.boolean(),
    turn: TurnSchema,
    staged: z.strictObject({
      proposalId: UUID,
      draftId: UUID,
      expectedDraftRevision: z.number().int().nonnegative(),
      nextDraftRevision: z.number().int().positive(),
    }),
  }),
  only("stale", "user_message_required", "stage_conflict", "stale_draft", "not_available"),
]);
const completeSchema = z.union([
  z.strictObject({
    status: z.enum(["completed", "replayed"]),
    turn: TurnSchema,
    draft: DraftSchema,
    proposalId: UUID,
    agentMessage: AgentMessageSchema,
  }),
  only("stale", "not_staged", "user_message_required", "document_finalized", "stale_draft", "not_available"),
]);

const InputsSchema = z
  .array(
    z.strictObject({
      ref: z.string().regex(/^[me][0-9]{1,3}$/),
      kind: z.enum(["mensaje", "extraccion"]),
      id: UUID,
    }),
  )
  .min(1)
  .max(400);

/**
 * Solo después de `Auth.getUser()`. `executor` debe ser el canal `galcoa_executor`
 * (nunca `service_role` ni SQL libre); `verifiedUserId` se pasa siempre como `p_actor_id`.
 */
export function createDurableChatStore(context: { verifiedUserId: string; executor: DocumentRpc }): DurableChatStore {
  /** Verifica actor y forma ANTES de cualquier E/S. */
  function scope(owner: string, audit: AuditContext) {
    if (!context.verifiedUserId || owner !== context.verifiedUserId || audit.actorScope !== owner) throw new DurableChatError("NO_SESSION");
    if (typeof audit.correlationId !== "string" || audit.correlationId.length < 1 || audit.correlationId.length > 128) {
      throw new DurableChatError("INVALID_INPUT");
    }
  }
  function ref(claim: TurnClaimRef) {
    if (!UUID.safeParse(claim.turnId).success || !Number.isInteger(claim.attempt) || claim.attempt < 1) throw new DurableChatError("INVALID_INPUT");
  }
  async function call<S extends z.ZodType>(schema: S, name: string, owner: string, args: Record<string, unknown>): Promise<z.output<S>> {
    let response: { data: unknown; error: unknown };
    try {
      response = await context.executor.rpc(name, { p_actor_id: owner, ...args });
    } catch {
      throw new DurableChatError("UNAVAILABLE");
    }
    if (response.error) {
      const code = typeof response.error === "object" && response.error !== null && "code" in response.error ? response.error.code : undefined;
      throw new DurableChatError(code === "42501" ? "NO_SESSION" : code === "22023" ? "INVALID_INPUT" : "UNAVAILABLE");
    }
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) throw new DurableChatError("INVALID_RESPONSE");
    return parsed.data;
  }
  /** La fila devuelta debe ser el turno/intento pedido; si no, la respuesta no es de confianza. */
  function bound(turn: TurnRecord, expected: { turnId?: string; attempt?: number; documentId?: string; clientMessageId?: string }) {
    for (const key of ["turnId", "attempt", "documentId", "clientMessageId"] as const) {
      if (expected[key] !== undefined && turn[key] !== expected[key]) throw new DurableChatError("INVALID_RESPONSE");
    }
    return turn;
  }
  const invalid = (): never => {
    throw new DurableChatError("INVALID_RESPONSE");
  };

  return {
    async claimTurn(i) {
      scope(i.ownerId, i.audit);
      if (!UUID.safeParse(i.documentId).success || !CLIENT_MESSAGE_ID.test(i.clientMessageId) || !FINGERPRINT.test(i.fingerprint) ||
          !Number.isInteger(i.leaseSeconds) || i.leaseSeconds < 1 || i.leaseSeconds > 300) throw new DurableChatError("INVALID_INPUT");
      const r = await call(claimSchema, "claim_chat_turn", i.ownerId, {
        p_document_id: i.documentId, p_client_message_id: i.clientMessageId, p_fingerprint: i.fingerprint,
        p_lease_seconds: i.leaseSeconds, p_correlation_id: i.audit.correlationId,
      });
      if (!("turn" in r)) return r;
      bound(r.turn, { documentId: i.documentId, clientMessageId: i.clientMessageId });
      if (r.status === "completed") {
        if (r.turn.state !== "completado" || r.agentMessage.messageId !== r.turn.agentMessageId || r.agentMessage.documentId !== i.documentId) invalid();
      } else {
        if (r.turn.state !== "en_curso") invalid();
        if (r.status === "claimed" && r.retried !== r.turn.attempt > 1) invalid();
      }
      return r;
    },
    async attachUserMessage(i) {
      scope(i.ownerId, i.audit);
      ref(i.claim);
      if (!UUID.safeParse(i.userMessageId).success) throw new DurableChatError("INVALID_INPUT");
      const r = await call(attachSchema, "attach_chat_turn_message", i.ownerId, {
        p_turn_id: i.claim.turnId, p_attempt: i.claim.attempt, p_user_message_id: i.userMessageId,
      });
      if (r.status === "attached" && (bound(r.turn, i.claim).userMessageId !== i.userMessageId || r.turn.state !== "en_curso")) invalid();
      return r;
    },
    async stageProposal(i) {
      scope(i.ownerId, i.audit);
      ref(i.claim);
      const inputs = InputsSchema.safeParse(i.inputs satisfies DraftInputRef[]);
      const proposal: unknown = i.proposal;
      if (!UUID.safeParse(i.documentId).success || !Number.isInteger(i.expectedDraftRevision) || i.expectedDraftRevision < 0 || !inputs.success ||
          typeof proposal !== "object" || proposal === null || Array.isArray(proposal) ||
          !z.array(z.string()).safeParse(i.limitations).success) throw new DurableChatError("INVALID_INPUT");
      const content = { title: i.content.title, body: i.content.body, corrections: i.content.corrections };
      // pg convierte arrays JS en arrays de Postgres: todo jsonb viaja ya serializado.
      const r = await call(stageSchema, "stage_chat_turn_proposal", i.ownerId, {
        p_turn_id: i.claim.turnId, p_attempt: i.claim.attempt, p_expected_draft_revision: i.expectedDraftRevision,
        p_content: JSON.stringify(content), p_proposal: JSON.stringify(proposal), p_inputs: JSON.stringify(inputs.data),
        p_model_id: i.modelId, p_prompt_version: i.promptVersion, p_limitations: JSON.stringify(i.limitations),
        p_correlation_id: i.audit.correlationId,
      });
      if (r.status === "staged") {
        bound(r.turn, { ...i.claim, documentId: i.documentId });
        if (r.turn.state !== "en_curso" || r.staged.expectedDraftRevision !== i.expectedDraftRevision ||
            r.staged.nextDraftRevision !== i.expectedDraftRevision + 1) invalid();
      }
      return r;
    },
    async completeTurn(i) {
      scope(i.ownerId, i.audit);
      ref(i.claim);
      if (i.agentContent.trim().length === 0 || i.agentContent.length > 8000) throw new DurableChatError("INVALID_INPUT");
      const r = await call(completeSchema, "complete_chat_turn", i.ownerId, {
        p_turn_id: i.claim.turnId, p_attempt: i.claim.attempt, p_agent_content: i.agentContent, p_correlation_id: i.audit.correlationId,
      });
      if (!("turn" in r)) return r;
      const turn = bound(r.turn, i.claim);
      if (turn.state !== "completado" || r.agentMessage.messageId !== turn.agentMessageId ||
          r.draft.documentId !== turn.documentId || r.agentMessage.documentId !== turn.documentId) invalid();
      return r;
    },
    async closeAttempt(i) {
      scope(i.ownerId, i.audit);
      ref(i.claim);
      const r = await call(closeSchema, "close_chat_turn", i.ownerId, {
        p_turn_id: i.claim.turnId, p_attempt: i.claim.attempt, p_state: i.state,
        p_error_code: toSqlErrorCode(i.errorCode), p_correlation_id: i.audit.correlationId,
      });
      if (r.status === "closed" && (bound(r.turn, i.claim).state !== i.state)) invalid();
      return r;
    },
  };
}

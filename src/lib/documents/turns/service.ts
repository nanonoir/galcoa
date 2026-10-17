import "server-only";

import { z } from "zod";

import { DeclaredEventDateSchema, type DocumentRecord, type Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";

import type { StagedRef } from "../drafting/ports";
import { MAX_MESSAGE_CHARS } from "../messages";
import type { SessionPort } from "../ports";
import { commandFingerprint, failure, IDEMPOTENCY_KEY_PATTERN, newId, type ServiceDeps, type ServiceResult } from "../result";

import type { CompleteTurnResult, DurableChatStore } from "./persistence";
import type { TurnClaimRef, TurnRecord } from "./ports";

/**
 * Turno de chat del servidor (MVP-052; REQ-03/05/15/16, INV-08).
 *
 * Orden: sesión y propiedad → claim del intento → mensaje del usuario
 * persistido (idempotente) **antes** de la IA → estado del documento
 * revalidado → Agente 1 con `AbortSignal` (solo deja staging ligado al
 * intento) → `completeTurn` publica borrador y respuesta oficial en una sola
 * transacción SQL; `draft`, `agent_message` y `done` se emiten después del
 * commit, con el resultado de esa transacción. Un parcial o un staging nunca
 * se oficializa; cancelar o fallar cierra el intento y conserva el mensaje del
 * usuario. El reintento usa el mismo `clientMessageId`: mismo mensaje de
 * usuario, otro intento; un turno ya completado recupera su resultado original
 * con `completeTurn` (replay) sin volver a invocar la IA. Actor y claim viajan
 * explícitos en cada llamada; la auditoría `chat_turn.*` la emite SQL.
 *
 * El Agente 1 devuelve salida estructurada en una sola llamada (MVP-051), así
 * que el flujo emite **eventos** de progreso ordenados, no tokens sueltos.
 */

export const TURN_LEASE_SECONDS = 90;

export const TurnCommandSchema = z.strictObject({
  documentId: z.string().min(1),
  /** Clave del mensaje del cliente: identifica el turno en reintentos y doble envío. */
  clientMessageId: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
  content: z
    .string()
    .refine((s) => s.trim().length > 0, "Mensaje vacío")
    .refine((s) => s.length <= MAX_MESSAGE_CHARS, `Supera ${MAX_MESSAGE_CHARS} caracteres`),
  declaredEventDate: DeclaredEventDateSchema.default({ kind: "unknown" }),
});

export type TurnEvent =
  | { type: "turn.started"; turnId: string; attempt: number; retried: boolean }
  | { type: "user_message"; messageId: string }
  | { type: "drafting" }
  /** Borrador ya publicado; los conteos solo existen si este intento generó la propuesta (no en replay). */
  | { type: "draft"; draftId: string; draftRevision: number; title: string; warnings?: number; notInformed?: number }
  | { type: "agent_message"; messageId: string; content: string }
  | { type: "done" }
  | { type: "cancelled" }
  | { type: "error"; error: TechnicalError };

/** Lo que el turno necesita del Agente 1 (MVP-051) y del servicio de mensajes (MVP-041). */
export type TurnDeps = ServiceDeps & {
  session: SessionPort;
  turns: DurableChatStore;
  messages: {
    recordUserMessage(command: unknown): Promise<ServiceResult<Message>>;
  };
  /** Lectura del documento del propietario para revalidar su estado antes de la IA. */
  documents: { getDocument(ownerId: string, documentId: string): Promise<DocumentRecord | null> };
  drafting: {
    generateDraft(command: {
      documentId: string;
      expectedDraftRevision: number;
      claim: TurnClaimRef;
      abortSignal?: AbortSignal;
      correlationId?: string;
    }): Promise<
      ServiceResult<{
        staged: StagedRef;
        proposal: { title: string; warnings: unknown[]; notInformed: string[] };
      }>
    >;
  };
  /** Revisión oficial vigente del borrador del propietario (0 si no hay). */
  currentDraftRevision(ownerId: string, documentId: string): Promise<number>;
  log?: (event: { correlationId: string; turnId: string; attempt: number; outcome: string }) => void;
};

/** Respuesta oficial del agente: breve, con referencias; el borrador completo es otro artefacto. */
export function agentReply(title: string, warnings: number, notInformed: number): string {
  const parts = [`Preparé el borrador «${title}».`];
  if (warnings > 0) parts.push(`Tiene ${warnings} ${warnings === 1 ? "advertencia" : "advertencias"} para revisar.`);
  if (notInformed > 0) parts.push(`${notInformed} ${notInformed === 1 ? "dato figura" : "datos figuran"} como «no informado».`);
  return parts.join(" ");
}

/** Fallos de `completeTurn` sin publicación (CAS/fencing/estado): nunca son éxito. */
function completionFailure(
  status: Exclude<CompleteTurnResult["status"], "completed" | "replayed">,
): { code: string; stage: TechnicalError["stage"]; retryable: boolean } {
  switch (status) {
    case "stale":
      return { code: "TURN_SUPERSEDED", stage: "ia", retryable: false };
    case "stale_draft":
      return { code: "STALE_DRAFT", stage: "persistencia", retryable: false };
    case "document_finalized":
      return { code: "DOCUMENT_FINALIZED", stage: "validacion", retryable: false };
    case "not_available":
      return { code: "NOT_AVAILABLE", stage: "persistencia", retryable: false };
    default:
      return { code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: false };
  }
}

export function createTurnService(deps: TurnDeps) {
  const correlation = deps.newCorrelationId ?? newId;

  return {
    /**
     * Valida y reclama el turno antes de abrir el flujo. Los errores previos
     * (sesión, propiedad, conflicto, en curso) vuelven como resultado; el
     * resto viaja como eventos del flujo.
     */
    async startTurn(
      command: unknown,
      abortSignal?: AbortSignal,
    ): Promise<
      ServiceResult<{ turn: TurnRecord; replay: Message | null; events: AsyncGenerator<TurnEvent> }>
    > {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);

      const parsed = TurnCommandSchema.safeParse(command);
      if (!parsed.success) return failure("INVALID_INPUT", "validacion", false, correlationId);
      const { documentId, clientMessageId, content, declaredEventDate } = parsed.data;
      const actor: string = ownerId;
      const audit = { actorScope: actor, correlationId };

      let claim;
      try {
        claim = await deps.turns.claimTurn({
          ownerId: actor,
          documentId,
          clientMessageId,
          fingerprint: commandFingerprint({ schemaVersion: 1, action: "chat.turn", documentId, content, declaredEventDate }),
          leaseSeconds: TURN_LEASE_SECONDS,
          audit,
        });
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
      if (claim.status === "not_available") return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
      if (claim.status === "idempotency_conflict") return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
      if (claim.status === "in_progress") return failure("TURN_IN_PROGRESS", "ia", true, correlationId);
      if (claim.status === "completed") {
        // Replay: el resultado original sale de `completeTurn` del mismo intento; no se reejecuta la IA.
        let replayed: CompleteTurnResult;
        try {
          replayed = await deps.turns.completeTurn({
            ownerId: actor,
            claim: { turnId: claim.turn.turnId, attempt: claim.turn.attempt },
            agentContent: claim.agentMessage.content,
            audit,
          });
        } catch {
          return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
        }
        if (replayed.status !== "replayed" && replayed.status !== "completed") {
          const f = completionFailure(replayed.status);
          return failure(f.code, f.stage, f.retryable, correlationId);
        }
        const { draft, agentMessage } = replayed;
        async function* replay(): AsyncGenerator<TurnEvent> {
          yield { type: "draft", draftId: draft.draftId, draftRevision: draft.draftRevision, title: draft.content.title };
          yield { type: "agent_message", messageId: agentMessage.messageId, content: agentMessage.content };
          yield { type: "done" };
        }
        return { ok: true, value: { turn: replayed.turn, replay: agentMessage, events: replay() }, replayed: true };
      }

      const { turn, retried } = claim;
      const ref: TurnClaimRef = { turnId: turn.turnId, attempt: turn.attempt };
      const log = (outcome: string) => deps.log?.({ correlationId, turnId: turn.turnId, attempt: turn.attempt, outcome });

      // El intento se cierra una sola vez (completar, fallar o cancelar); si el consumidor corta el flujo antes, `run` lo cancela.
      let settled = false;
      const close = async (state: "fallido" | "cancelado", errorCode: string) => {
        if (settled) return;
        settled = true;
        try {
          await deps.turns.closeAttempt({ ownerId: actor, claim: ref, state, errorCode, audit });
        } catch {
          // Si no se pudo escribir, el claim vence y el reintento lo recupera (SH-05).
        }
        log(state);
      };

      async function* run(): AsyncGenerator<TurnEvent> {
        try {
          yield* attempt();
        } finally {
          await close("cancelado", "AI_ABORTED");
        }
      }

      async function* attempt(): AsyncGenerator<TurnEvent> {
        const fail = async function* (error: TechnicalError, state: "fallido" | "cancelado" = "fallido"): AsyncGenerator<TurnEvent> {
          await close(state, error.code);
          yield state === "cancelado" ? { type: "cancelled" } : { type: "error", error };
        };
        const technical = (): TechnicalError => ({ code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId });

        yield { type: "turn.started", turnId: turn.turnId, attempt: turn.attempt, retried };
        log(retried ? "retried" : "started");

        // 1. Mensaje original del usuario, antes de la IA. La clave deriva del turno: un reintento lo repite.
        const recorded = await deps.messages.recordUserMessage({
          documentId,
          content,
          declaredEventDate,
          // Hash completo: truncar `clientMessageId` (hasta 128) podía colisionar entre ids distintos.
          idempotencyKey: `turn-${commandFingerprint({ schemaVersion: 1, action: "chat.turn.user_message", documentId, clientMessageId })}`,
        });
        if (!recorded.ok) return yield* fail(recorded.error);
        let attached;
        try {
          attached = await deps.turns.attachUserMessage({ ownerId: actor, claim: ref, userMessageId: recorded.value.messageId, audit });
        } catch {
          return yield* fail(technical());
        }
        // Fencing: si otro intento (o un lease recuperado) ya es dueño del turno, este no sigue hacia la IA.
        if (attached.status !== "attached") {
          const f = completionFailure(attached.status);
          return yield* fail({ code: f.code, stage: f.stage, retryable: f.retryable, correlationId });
        }
        yield { type: "user_message", messageId: recorded.value.messageId };

        if (abortSignal?.aborted) return yield* fail({ code: "AI_ABORTED", stage: "ia", retryable: true, correlationId }, "cancelado");

        // 2. Estado y revisión vigentes justo antes de la IA (el documento pudo cambiar tras el claim).
        yield { type: "drafting" };
        let revision: number;
        try {
          const document = await deps.documents.getDocument(actor, documentId);
          if (!document) return yield* fail({ code: "NOT_AVAILABLE", stage: "persistencia", retryable: false, correlationId });
          // Una versión finalizada es inmutable (INV-05): no se redacta sobre ella; crear otra versión no es de este turno.
          if (document.documentStatus === "finalizado") {
            const f = completionFailure("document_finalized");
            return yield* fail({ code: f.code, stage: f.stage, retryable: f.retryable, correlationId });
          }
          revision = await deps.currentDraftRevision(actor, documentId);
        } catch {
          return yield* fail(technical());
        }

        // 3. Agente 1 con cancelación propagada: solo deja staging ligado a este intento.
        const drafted = await deps.drafting.generateDraft({ documentId, expectedDraftRevision: revision, claim: ref, abortSignal, correlationId });
        if (!drafted.ok) {
          const cancelled = abortSignal?.aborted || drafted.error.code === "AI_ABORTED";
          return yield* fail(drafted.error, cancelled ? "cancelado" : "fallido");
        }
        const { proposal } = drafted.value;
        // Cancelado después del staging: no se completa; el staging nunca se vuelve oficial.
        if (abortSignal?.aborted) return yield* fail({ code: "AI_ABORTED", stage: "ia", retryable: true, correlationId }, "cancelado");

        // 4. Publicación atómica: borrador oficial + respuesta del agente + cierre del turno.
        let completed: CompleteTurnResult;
        try {
          completed = await deps.turns.completeTurn({
            ownerId: actor,
            claim: ref,
            agentContent: agentReply(proposal.title, proposal.warnings.length, proposal.notInformed.length),
            audit,
          });
        } catch {
          // Resultado desconocido: cerrar es no-op si ya se confirmó; el reintento recupera el original por replay.
          return yield* fail(technical());
        }
        if (completed.status !== "completed" && completed.status !== "replayed") {
          log(completed.status);
          const f = completionFailure(completed.status);
          return yield* fail({ code: f.code, stage: f.stage, retryable: f.retryable, correlationId });
        }
        settled = true;
        log("completed");
        const { draft, agentMessage } = completed;
        yield {
          type: "draft",
          draftId: draft.draftId,
          draftRevision: draft.draftRevision,
          title: draft.content.title,
          warnings: proposal.warnings.length,
          notInformed: proposal.notInformed.length,
        };
        yield { type: "agent_message", messageId: agentMessage.messageId, content: agentMessage.content };
        yield { type: "done" };
      }

      return { ok: true, value: { turn, replay: null, events: run() } };
    },
  };
}

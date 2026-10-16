import "server-only";

import { z } from "zod";

import { DeclaredEventDateSchema, type Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";

import { MAX_MESSAGE_CHARS } from "../messages";
import type { SessionPort } from "../ports";
import { commandFingerprint, failure, IDEMPOTENCY_KEY_PATTERN, newId, type ServiceDeps, type ServiceResult } from "../result";

import type { TurnRecord, TurnStore } from "./ports";

/**
 * Turno de chat del servidor (MVP-052; REQ-03/05/15/16, INV-08).
 *
 * Orden: sesión y propiedad → mensaje del usuario persistido (idempotente)
 * **antes** de la IA → claim del intento → Agente 1 con `AbortSignal` → al
 * completar, respuesta oficial del agente con referencias al borrador, en la
 * misma transacción que cierra el turno. Un parcial nunca se oficializa;
 * cancelar o fallar cierra el intento y conserva el mensaje del usuario. El
 * reintento usa el mismo `clientMessageId`: mismo mensaje de usuario, otro
 * intento, como mucho una respuesta completada.
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
  | { type: "draft"; draftId: string; draftRevision: number; title: string; warnings: number; notInformed: number }
  | { type: "agent_message"; messageId: string; content: string }
  | { type: "done" }
  | { type: "cancelled" }
  | { type: "error"; error: TechnicalError };

/** Lo que el turno necesita del Agente 1 (MVP-051) y del servicio de mensajes (MVP-041). */
export type TurnDeps = ServiceDeps & {
  session: SessionPort;
  turns: TurnStore;
  messages: {
    recordUserMessage(command: unknown): Promise<ServiceResult<Message>>;
  };
  drafting: {
    generateDraft(command: {
      documentId: string;
      expectedDraftRevision: number;
      abortSignal?: AbortSignal;
      correlationId?: string;
    }): Promise<
      ServiceResult<{
        draft: { draftId: string; draftRevision: number; content: { title: string } };
        proposalId: string;
        proposal: { warnings: unknown[]; notInformed: string[] };
      }>
    >;
  };
  /** Revisión vigente del borrador del propietario (0 si no hay); lectura del adaptador de borradores. */
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
      const audit = { actorScope: ownerId, correlationId };

      let claim;
      try {
        claim = await deps.turns.claimTurn({
          ownerId,
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
        const agentMessage = claim.agentMessage;
        async function* replay(): AsyncGenerator<TurnEvent> {
          yield { type: "agent_message", messageId: agentMessage.messageId, content: agentMessage.content };
          yield { type: "done" };
        }
        return { ok: true, value: { turn: claim.turn, replay: agentMessage, events: replay() }, replayed: true };
      }

      const { turn, retried } = claim;
      const log = (outcome: string) => deps.log?.({ correlationId, turnId: turn.turnId, attempt: turn.attempt, outcome });

      async function* run(): AsyncGenerator<TurnEvent> {
        const close = async (state: "fallido" | "cancelado", errorCode: string) => {
          try {
            await deps.turns.closeAttempt({ ownerId: ownerId!, turnId: turn.turnId, attempt: turn.attempt, state, errorCode, audit });
          } catch {
            // Si no se pudo escribir, el claim vence y el reintento lo recupera (SH-05).
          }
          log(state);
        };
        const fail = async function* (error: TechnicalError, state: "fallido" | "cancelado" = "fallido"): AsyncGenerator<TurnEvent> {
          await close(state, error.code);
          yield state === "cancelado" ? { type: "cancelled" } : { type: "error", error };
        };

        yield { type: "turn.started", turnId: turn.turnId, attempt: turn.attempt, retried };
        log(retried ? "retried" : "started");

        // 1. Mensaje original del usuario, antes de la IA. La clave deriva del turno: un reintento lo repite.
        const recorded = await deps.messages.recordUserMessage({
          documentId,
          content,
          declaredEventDate,
          idempotencyKey: `turn-${clientMessageId}`.slice(0, 128),
        });
        if (!recorded.ok) return yield* fail(recorded.error);
        try {
          await deps.turns.attachUserMessage({ ownerId: ownerId!, turnId: turn.turnId, userMessageId: recorded.value.messageId });
        } catch {
          return yield* fail({ code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId });
        }
        yield { type: "user_message", messageId: recorded.value.messageId };

        if (abortSignal?.aborted) return yield* fail({ code: "AI_ABORTED", stage: "ia", retryable: true, correlationId }, "cancelado");

        // 2. Agente 1 con cancelación propagada.
        yield { type: "drafting" };
        let revision: number;
        try {
          revision = await deps.currentDraftRevision(ownerId!, documentId);
        } catch {
          return yield* fail({ code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId });
        }
        const drafted = await deps.drafting.generateDraft({ documentId, expectedDraftRevision: revision, abortSignal, correlationId });
        if (!drafted.ok) {
          const cancelled = abortSignal?.aborted || drafted.error.code === "AI_ABORTED";
          return yield* fail(drafted.error, cancelled ? "cancelado" : "fallido");
        }
        const { draft, proposalId, proposal } = drafted.value;
        yield {
          type: "draft",
          draftId: draft.draftId,
          draftRevision: draft.draftRevision,
          title: draft.content.title,
          warnings: proposal.warnings.length,
          notInformed: proposal.notInformed.length,
        };

        // 3. Respuesta oficial solo al completar, en la misma transacción que cierra el turno.
        const reply = agentReply(draft.content.title, proposal.warnings.length, proposal.notInformed.length);
        let completed;
        try {
          completed = await deps.turns.completeTurn({
            ownerId: ownerId!,
            turnId: turn.turnId,
            attempt: turn.attempt,
            agentContent: reply,
            artifacts: { draftId: draft.draftId, draftRevision: draft.draftRevision, proposalId },
            audit,
          });
        } catch {
          return yield* fail({ code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId });
        }
        if (completed.status === "stale") {
          // Otro intento ya cerró el turno: este no publica una segunda respuesta.
          log("stale");
          yield { type: "error", error: { code: "TURN_SUPERSEDED", stage: "ia", retryable: false, correlationId } };
          return;
        }
        log("completed");
        yield { type: "agent_message", messageId: completed.agentMessage.messageId, content: completed.agentMessage.content };
        yield { type: "done" };
      }

      return { ok: true, value: { turn, replay: null, events: run() } };
    },
  };
}

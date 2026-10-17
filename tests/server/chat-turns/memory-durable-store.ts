import { randomUUID } from "node:crypto";

import type { Draft, Message } from "@/lib/contracts/core";
import type { StageProposalInput } from "@/lib/documents/drafting/ports";
import type { CompleteTurnResult, DurableChatStore } from "@/lib/documents/turns/persistence";
import type { TurnRecord } from "@/lib/documents/turns/ports";

/**
 * Doble en memoria de `DurableChatStore` con la semántica de 02500/02501:
 * fencing por intento, lease, staging que NO toca el borrador oficial,
 * completar atómico con CAS de revisión y replay del resultado original.
 */
type Row = TurnRecord & {
  fingerprint: string;
  ownerId: string;
  staged: { input: StageProposalInput; proposalId: string; draftId: string } | null;
  result: Extract<CompleteTurnResult, { turn: TurnRecord }> | null;
};

export function createMemoryDurableStore(options: {
  owners: () => Map<string, string>;
  now?: () => number;
  /** Documentos finalizados: completar no publica. */
  finalized?: Set<string>;
}) {
  const now = options.now ?? (() => Date.now());
  const rows = new Map<string, Row>();
  const drafts = new Map<string, Draft>();
  const agentMessages = new Map<string, Message>();
  const events: { type: string; turnId: string; attempt: number }[] = [];
  const calls = { complete: 0, stage: 0 };
  const hooks: { beforeComplete?: () => void; loseCompleteResponse?: boolean } = {};

  const find = (turnId: string) => [...rows.values()].find((r) => r.turnId === turnId);
  const view = (r: Row): TurnRecord => ({
    turnId: r.turnId,
    documentId: r.documentId,
    clientMessageId: r.clientMessageId,
    attempt: r.attempt,
    state: r.state,
    userMessageId: r.userMessageId,
    agentMessageId: r.agentMessageId,
    leaseExpiresAt: r.leaseExpiresAt,
  });
  const current = (r: Row | undefined, attempt: number): r is Row => !!r && r.attempt === attempt && r.state === "en_curso" && Date.parse(r.leaseExpiresAt!) > now();

  const store: DurableChatStore = {
    async claimTurn(i) {
      if (options.owners().get(i.documentId) !== i.ownerId) return { status: "not_available" };
      const key = `${i.ownerId}|${i.clientMessageId}`;
      const lease = () => new Date(now() + i.leaseSeconds * 1000).toISOString();
      const t = rows.get(key);
      if (!t) {
        const row: Row = {
          turnId: randomUUID(), documentId: i.documentId, clientMessageId: i.clientMessageId, attempt: 1, state: "en_curso",
          userMessageId: null, agentMessageId: null, leaseExpiresAt: lease(), fingerprint: i.fingerprint, ownerId: i.ownerId,
          staged: null, result: null,
        };
        rows.set(key, row);
        events.push({ type: "turn.started", turnId: row.turnId, attempt: 1 });
        return { status: "claimed", turn: view(row), retried: false };
      }
      if (t.fingerprint !== i.fingerprint || t.documentId !== i.documentId) return { status: "idempotency_conflict" };
      if (t.state === "completado") return { status: "completed", turn: view(t), agentMessage: agentMessages.get(t.turnId)! };
      if (t.state === "en_curso" && Date.parse(t.leaseExpiresAt!) > now()) return { status: "in_progress", turn: view(t) };
      // Recuperar el lease invalida el staging anterior.
      Object.assign(t, { attempt: t.attempt + 1, state: "en_curso", leaseExpiresAt: lease(), staged: null });
      events.push({ type: "turn.retried", turnId: t.turnId, attempt: t.attempt });
      return { status: "claimed", turn: view(t), retried: true };
    },
    async attachUserMessage({ claim, userMessageId }) {
      const t = find(claim.turnId);
      if (!t) return { status: "not_available" };
      if (!current(t, claim.attempt)) return { status: "stale" };
      t.userMessageId = userMessageId;
      return { status: "attached", turn: view(t) };
    },
    async stageProposal(input) {
      calls.stage += 1;
      const t = find(input.claim.turnId);
      if (!t) return { status: "not_available" };
      if (!current(t, input.claim.attempt)) return { status: "stale" };
      if (!t.userMessageId) return { status: "user_message_required" };
      const revision = drafts.get(t.documentId)?.draftRevision ?? 0;
      if (input.expectedDraftRevision !== revision) return { status: "stale_draft" };
      const body = JSON.stringify([input.content, input.proposal, input.inputs]);
      if (t.staged && JSON.stringify([t.staged.input.content, t.staged.input.proposal, t.staged.input.inputs]) !== body) return { status: "stage_conflict" };
      const replayed = t.staged !== null;
      t.staged ??= { input: structuredClone(input), proposalId: randomUUID(), draftId: drafts.get(t.documentId)?.draftId ?? randomUUID() };
      return {
        status: "staged",
        replayed,
        turn: view(t),
        staged: { proposalId: t.staged.proposalId, draftId: t.staged.draftId, expectedDraftRevision: revision, nextDraftRevision: revision + 1 },
      };
    },
    async completeTurn({ claim, agentContent }) {
      calls.complete += 1;
      hooks.beforeComplete?.();
      const t = find(claim.turnId);
      if (!t) return { status: "not_available" };
      if (t.state === "completado") return t.attempt === claim.attempt && t.result ? { ...t.result, status: "replayed", turn: view(t) } : { status: "stale" };
      if (!current(t, claim.attempt)) return { status: "stale" };
      if (!t.userMessageId) return { status: "user_message_required" };
      if (!t.staged) return { status: "not_staged" };
      if (options.finalized?.has(t.documentId)) return { status: "document_finalized" };
      const official = drafts.get(t.documentId);
      if ((official?.draftRevision ?? 0) !== t.staged.input.expectedDraftRevision) return { status: "stale_draft" };

      // Todo o nada: borrador (mismo ID, revisión + 1), mensaje del agente y cierre.
      const draft: Draft = {
        draftId: t.staged.draftId,
        documentId: t.documentId,
        draftRevision: t.staged.input.expectedDraftRevision + 1,
        content: t.staged.input.content,
        updatedAt: new Date(now()).toISOString(),
      };
      const message: Message = {
        messageId: randomUUID(), documentId: t.documentId, sender: "agente", content: agentContent,
        declaredEventDate: { kind: "unknown" }, uploadedAt: new Date(now()).toISOString(),
      };
      drafts.set(t.documentId, draft);
      agentMessages.set(t.turnId, message);
      Object.assign(t, { state: "completado", agentMessageId: message.messageId, leaseExpiresAt: null });
      const result = { status: "completed" as const, turn: view(t), draft, proposalId: t.staged.proposalId, agentMessage: message };
      t.result = result;
      t.staged = null;
      events.push({ type: "turn.completed", turnId: t.turnId, attempt: t.attempt });
      if (hooks.loseCompleteResponse) {
        hooks.loseCompleteResponse = false;
        throw new Error("respuesta perdida");
      }
      return result;
    },
    async closeAttempt({ claim, state }) {
      const t = find(claim.turnId);
      if (!t) return { status: "not_available" };
      // Cerrar admite un lease vencido si el intento sigue vigente; nunca toca un turno completado.
      if (t.attempt !== claim.attempt || t.state !== "en_curso") return { status: "stale" };
      Object.assign(t, { state, leaseExpiresAt: null, staged: null });
      events.push({ type: state === "cancelado" ? "turn.cancelled" : "turn.failed", turnId: t.turnId, attempt: t.attempt });
      return { status: "closed", turn: view(t) };
    },
  };
  return { store, rows, drafts, agentMessages, events, calls, hooks };
}

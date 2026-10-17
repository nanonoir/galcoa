import { describe, expect, it, vi } from "vitest";

import { createDurableChatStore, DurableChatError, toSqlErrorCode, type DurableChatStore } from "@/lib/documents/turns/persistence";
import { turnRpcCommands } from "@/lib/documents/turns/rpc-commands";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const TURN = "33333333-3333-4333-8333-333333333333";
const USER_MSG = "44444444-4444-4444-8444-444444444444";
const AGENT_MSG = "55555555-5555-4555-8555-555555555555";
const PROPOSAL = "66666666-6666-4666-8666-666666666666";
const DRAFT = "77777777-7777-4777-8777-777777777777";
const FP = "a".repeat(64);
const CLIENT_MSG = "client-message-" + "x".repeat(60);
const NOW = "2026-10-16T10:00:00.000000Z";
const audit = { actorScope: ACTOR, correlationId: "corr-1" };
const claim = { turnId: TURN, attempt: 1 };

const turn = (over: Record<string, unknown> = {}) => ({
  turnId: TURN, documentId: DOC, clientMessageId: CLIENT_MSG, attempt: 1, state: "en_curso",
  userMessageId: null, agentMessageId: null, leaseExpiresAt: NOW, ...over,
});
const done = (over: Record<string, unknown> = {}) => turn({ state: "completado", agentMessageId: AGENT_MSG, leaseExpiresAt: null, ...over });
const message = (over: Record<string, unknown> = {}) => ({
  messageId: AGENT_MSG, documentId: DOC, sender: "agente", content: "Listo", declaredEventDate: { kind: "unknown" }, uploadedAt: NOW, ...over,
});
const draft = (over: Record<string, unknown> = {}) => ({
  draftId: DRAFT, documentId: DOC, draftRevision: 3, content: { title: "T", body: "B", corrections: [] }, updatedAt: NOW, ...over,
});
const completed = (status = "completed", over: Record<string, unknown> = {}) => ({
  status, turn: done(), draft: draft(), proposalId: PROPOSAL, agentMessage: message(), ...over,
});

function setup(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const store: DurableChatStore = createDurableChatStore({ verifiedUserId: ACTOR, executor: { rpc } });
  return { rpc, store };
}
const stageInput = (over: Record<string, unknown> = {}) => ({
  ownerId: ACTOR, documentId: DOC, claim, expectedDraftRevision: 2, content: { title: "T", body: "B", corrections: ["c"] },
  proposal: { facts: [] }, inputs: [{ ref: "m1", kind: "mensaje" as const, id: USER_MSG }], modelId: "model", promptVersion: "p1",
  limitations: ["l"], audit, ...over,
});
const claimInput = { ownerId: ACTOR, documentId: DOC, clientMessageId: CLIENT_MSG, fingerprint: FP, leaseSeconds: 90, audit };

describe("adaptador SQL de turnos durables (RPC doblada)", () => {
  it("cada comando usa exactamente los argumentos de la allowlist", async () => {
    const calls: [string, string[]][] = [];
    const { rpc, store } = setup(null);
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      calls.push([name, Object.keys(args)]);
      return { data: { status: "not_available" }, error: null };
    });
    await store.claimTurn(claimInput);
    await store.attachUserMessage({ ownerId: ACTOR, claim, userMessageId: USER_MSG, audit });
    await store.stageProposal(stageInput());
    await store.completeTurn({ ownerId: ACTOR, claim, agentContent: "Listo", audit });
    await store.closeAttempt({ ownerId: ACTOR, claim, state: "fallido", errorCode: "AI_FAILED", audit });
    expect(calls.map(([n]) => n).sort()).toEqual(Object.keys(turnRpcCommands).sort());
    for (const [name, keys] of calls) {
      expect([...keys].sort()).toEqual([...turnRpcCommands[name as keyof typeof turnRpcCommands]].sort());
    }
  });

  it("claim envía clave e fingerprint completos sin truncar y p_actor_id verificado", async () => {
    const { rpc, store } = setup({ status: "claimed", turn: turn(), retried: false });
    expect(await store.claimTurn(claimInput)).toMatchObject({ status: "claimed", retried: false });
    expect(rpc).toHaveBeenCalledWith("claim_chat_turn", {
      p_actor_id: ACTOR, p_document_id: DOC, p_client_message_id: CLIENT_MSG, p_fingerprint: FP, p_lease_seconds: 90, p_correlation_id: "corr-1",
    });
  });

  it("claim: estados terminales, replay y reintento coherentes", async () => {
    expect(await setup({ status: "in_progress", turn: turn() }).store.claimTurn(claimInput)).toMatchObject({ status: "in_progress" });
    expect(await setup({ status: "claimed", turn: turn({ attempt: 2 }), retried: true }).store.claimTurn(claimInput)).toMatchObject({ retried: true });
    const replay = await setup({ status: "completed", turn: done(), agentMessage: message() }).store.claimTurn(claimInput);
    expect(replay).toMatchObject({ status: "completed", agentMessage: { messageId: AGENT_MSG } });
    for (const status of ["idempotency_conflict", "not_available"] as const) {
      expect(await setup({ status }).store.claimTurn(claimInput)).toEqual({ status });
    }
  });

  it.each([
    ["documento ajeno", { status: "claimed", turn: turn({ documentId: TURN }), retried: false }],
    ["clientMessageId ajeno", { status: "claimed", turn: turn({ clientMessageId: "otro-mensaje-1" }), retried: false }],
    ["retried inconsistente", { status: "claimed", turn: turn(), retried: true }],
    ["claimed completado", { status: "claimed", turn: done(), retried: false }],
    ["completed sin mensaje coincidente", { status: "completed", turn: done({ agentMessageId: USER_MSG }), agentMessage: message() }],
    ["completed con mensaje de otro documento", { status: "completed", turn: done(), agentMessage: message({ documentId: TURN }) }],
    ["completed con mensaje del autor", { status: "completed", turn: done(), agentMessage: message({ sender: "autor" }) }],
    ["campo extra", { status: "in_progress", turn: turn(), leak: 1 }],
    ["estado desconocido", { status: "ok" }],
    ["fecha malformada", { status: "claimed", turn: turn({ leaseExpiresAt: "mañana" }), retried: false }],
    ["lease sin vigente", { status: "claimed", turn: turn({ leaseExpiresAt: null }), retried: false }],
  ])("claim rechaza respuesta inválida: %s", async (_name, data) => {
    await expect(setup(data).store.claimTurn(claimInput)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("attach: attached/stale/not_available y verifica turno e intento", async () => {
    const input = { ownerId: ACTOR, claim, userMessageId: USER_MSG, audit };
    expect(await setup({ status: "attached", turn: turn({ userMessageId: USER_MSG }) }).store.attachUserMessage(input)).toMatchObject({ status: "attached" });
    for (const status of ["stale", "not_available"] as const) expect(await setup({ status }).store.attachUserMessage(input)).toEqual({ status });
    for (const bad of [turn({ userMessageId: USER_MSG, attempt: 2 }), turn({ userMessageId: USER_MSG, turnId: DOC }), turn({ userMessageId: AGENT_MSG })]) {
      await expect(setup({ status: "attached", turn: bad }).store.attachUserMessage(input)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("stage: serializa jsonb como texto (arrays incluidos) y devuelve solo referencias", async () => {
    const staged = { proposalId: PROPOSAL, draftId: DRAFT, expectedDraftRevision: 2, nextDraftRevision: 3 };
    const { rpc, store } = setup({ status: "staged", replayed: false, turn: turn({ userMessageId: USER_MSG }), staged });
    const result = await store.stageProposal(stageInput());
    expect(result).toEqual({ status: "staged", replayed: false, turn: expect.anything(), staged });
    expect(result).not.toHaveProperty("draft");
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args).toMatchObject({
      p_turn_id: TURN, p_attempt: 1, p_expected_draft_revision: 2, p_model_id: "model", p_prompt_version: "p1",
      p_content: JSON.stringify({ title: "T", body: "B", corrections: ["c"] }),
      p_proposal: JSON.stringify({ facts: [] }),
      p_inputs: JSON.stringify([{ ref: "m1", kind: "mensaje", id: USER_MSG }]),
      p_limitations: JSON.stringify(["l"]),
    });
    for (const key of ["p_content", "p_proposal", "p_inputs", "p_limitations"]) expect(typeof args[key]).toBe("string");
  });

  it("stage: estados no exitosos y rechazo de refs inconsistentes", async () => {
    for (const status of ["stale", "user_message_required", "stage_conflict", "stale_draft", "not_available"] as const) {
      expect(await setup({ status }).store.stageProposal(stageInput())).toEqual({ status });
    }
    const good = { proposalId: PROPOSAL, draftId: DRAFT, expectedDraftRevision: 2, nextDraftRevision: 3 };
    const bads = [
      { turn: turn({ attempt: 9 }), staged: good },
      { turn: turn({ documentId: TURN }), staged: good },
      { turn: turn(), staged: { ...good, nextDraftRevision: 4 } },
      { turn: turn(), staged: { ...good, expectedDraftRevision: 1, nextDraftRevision: 2 } },
      { turn: turn(), staged: { ...good, draft: draft() } },
    ];
    for (const b of bads) {
      await expect(setup({ status: "staged", replayed: false, ...b }).store.stageProposal(stageInput())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("stage: rechaza entradas malformadas antes de la E/S", async () => {
    const { rpc, store } = setup({ status: "stale" });
    const bad = [
      { inputs: [] }, { inputs: [{ ref: "x1", kind: "mensaje", id: USER_MSG }] }, { inputs: [{ ref: "m1", kind: "mensaje", id: "no" }] },
      { proposal: [] }, { proposal: null }, { limitations: [1] }, { expectedDraftRevision: -1 }, { claim: { turnId: "x", attempt: 1 } },
      { claim: { turnId: TURN, attempt: 0 } }, { documentId: "x" },
    ];
    for (const over of bad) await expect(store.stageProposal(stageInput(over))).rejects.toBeInstanceOf(DurableChatError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("complete: devuelve el resultado original y valida pertenencia", async () => {
    const input = { ownerId: ACTOR, claim, agentContent: "Listo", audit };
    for (const status of ["completed", "replayed"]) {
      expect(await setup(completed(status)).store.completeTurn(input)).toMatchObject({
        status, proposalId: PROPOSAL, draft: { draftId: DRAFT, draftRevision: 3 }, agentMessage: { messageId: AGENT_MSG },
      });
    }
    for (const status of ["stale", "not_staged", "user_message_required", "document_finalized", "stale_draft", "not_available"] as const) {
      expect(await setup({ status }).store.completeTurn(input)).toEqual({ status });
    }
    const bads = [
      completed("completed", { draft: draft({ documentId: TURN }) }),
      completed("completed", { agentMessage: message({ documentId: TURN }) }),
      completed("completed", { agentMessage: message({ sender: "autor" }) }),
      completed("completed", { agentMessage: message({ messageId: USER_MSG }) }),
      completed("completed", { turn: turn() }),
      completed("completed", { turn: done({ attempt: 2 }) }),
      completed("completed", { turn: done({ turnId: DOC }) }),
      completed("completed", { proposalId: "x" }),
      { ...completed(), extra: 1 },
    ];
    for (const bad of bads) await expect(setup(bad).store.completeTurn(input)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("close: convierte el código de dominio, sin tragar estados", async () => {
    const closed = (state: string) => ({ status: "closed", turn: turn({ state, leaseExpiresAt: null }) });
    const { rpc, store } = setup(closed("cancelado"));
    expect(await store.closeAttempt({ ownerId: ACTOR, claim, state: "cancelado", errorCode: "AI_ABORTED", audit })).toMatchObject({ status: "closed" });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_state: "cancelado", p_error_code: "ai_aborted", p_attempt: 1 });
    for (const status of ["stale", "not_available"] as const) {
      expect(await setup({ status }).store.closeAttempt({ ownerId: ACTOR, claim, state: "fallido", errorCode: "x", audit })).toEqual({ status });
    }
    // un cierre concurrente por otro estado no es éxito
    await expect(setup(closed("fallido")).store.closeAttempt({ ownerId: ACTOR, claim, state: "cancelado", errorCode: "ai_aborted", audit }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(["AI_ABORTED", "turn_superseded", "a".repeat(64), "a".repeat(65), "bad code", "", "ñ"].map(toSqlErrorCode)).toEqual([
      "ai_aborted", "turn_superseded", "a".repeat(64), "unknown_error", "unknown_error", "unknown_error", "unknown_error",
    ]);
  });

  it("actor divergente o auditoría ajena se rechazan antes del RPC", async () => {
    const { rpc, store } = setup({ status: "not_available" });
    const other = "99999999-9999-4999-8999-999999999999";
    await expect(store.claimTurn({ ...claimInput, ownerId: other, audit: { ...audit, actorScope: other } })).rejects.toMatchObject({ code: "NO_SESSION" });
    await expect(store.claimTurn({ ...claimInput, audit: { ...audit, actorScope: other } })).rejects.toMatchObject({ code: "NO_SESSION" });
    await expect(store.completeTurn({ ownerId: other, claim, agentContent: "x", audit })).rejects.toMatchObject({ code: "NO_SESSION" });
    await expect(store.closeAttempt({ ownerId: other, claim, state: "fallido", errorCode: "x", audit })).rejects.toMatchObject({ code: "NO_SESSION" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { clientMessageId: "corto" }, { clientMessageId: "x".repeat(129) }, { fingerprint: "A".repeat(64) }, { fingerprint: "a".repeat(63) },
    { leaseSeconds: 0 }, { leaseSeconds: 301 }, { leaseSeconds: 1.5 }, { documentId: "doc" },
  ])("claim valida entradas antes de la E/S: %o", async (over) => {
    const { rpc, store } = setup({ status: "not_available" });
    await expect(store.claimTurn({ ...claimInput, ...over })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("errores del ejecutor se mapean a códigos opacos sin filtrar detalles", async () => {
    const secret = "postgres://user:pw@host password authentication failed";
    const cases: [unknown, string][] = [[{ code: "42501", message: secret }, "NO_SESSION"], [{ code: "22023", message: secret }, "INVALID_INPUT"], [{ code: "EXECUTOR_UNAVAILABLE", message: secret }, "UNAVAILABLE"], [secret, "UNAVAILABLE"]];
    for (const [error, code] of cases) {
      const err = await setup(null, error).store.claimTurn(claimInput).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DurableChatError);
      expect(err).toMatchObject({ code, message: "Persistencia de turnos no disponible" });
      expect(JSON.stringify(err) + String((err as Error).stack)).not.toContain("pw@");
    }
    const rejecting = createDurableChatStore({ verifiedUserId: ACTOR, executor: { rpc: () => Promise.reject(new Error(secret)) } });
    const err = await rejecting.claimTurn(claimInput).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "UNAVAILABLE", message: "Persistencia de turnos no disponible" });
  });
});

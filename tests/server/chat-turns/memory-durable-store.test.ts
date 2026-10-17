import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { DurableChatStore } from "@/lib/documents/turns/persistence";
import type { TurnClaimRef } from "@/lib/documents/turns/ports";

import { createMemoryDurableStore } from "./memory-durable-store";

// Datos ficticios; solo verifica que el doble modela lo que las pruebas de orquestación suponen.
const ANA = "11111111-1111-4111-8111-111111111111";
const DOC = "33333333-3333-4333-8333-333333333333";
const audit = { actorScope: ANA, correlationId: "c" };

async function started(now = () => 0) {
  const t = createMemoryDurableStore({ owners: () => new Map([[DOC, ANA]]), now });
  const claim = await t.store.claimTurn({ ownerId: ANA, documentId: DOC, clientMessageId: "msg-cliente-0001", fingerprint: "f", leaseSeconds: 90, audit });
  if (claim.status !== "claimed") throw new Error("setup");
  const ref: TurnClaimRef = { turnId: claim.turn.turnId, attempt: claim.turn.attempt };
  await t.store.attachUserMessage({ ownerId: ANA, claim: ref, userMessageId: randomUUID(), audit });
  return { ...t, ref };
}

const stage = (store: DurableChatStore, claim: TurnClaimRef, expectedDraftRevision = 0) =>
  store.stageProposal({
    ownerId: ANA, documentId: DOC, claim, audit, expectedDraftRevision,
    content: { title: "Entrega", body: "Cuerpo.", corrections: [] }, proposal: {}, inputs: [], modelId: "doble", promptVersion: "v1", limitations: [],
  });

describe("doble de DurableChatStore", () => {
  it("el staging no crea el borrador oficial; completar lo publica una vez y el replay devuelve el original", async () => {
    const t = await started();

    const staged = await stage(t.store, t.ref);
    expect(staged).toMatchObject({ status: "staged", replayed: false });
    expect(t.drafts.size).toBe(0);

    const done = await t.store.completeTurn({ ownerId: ANA, claim: t.ref, agentContent: "Listo", audit });
    const replay = await t.store.completeTurn({ ownerId: ANA, claim: t.ref, agentContent: "Listo", audit });
    expect(done).toMatchObject({ status: "completed", draft: { draftRevision: 1 } });
    expect(replay).toMatchObject({ status: "replayed", proposalId: done.status === "completed" ? done.proposalId : "" });
    expect(t.drafts.get(DOC)?.draftRevision).toBe(1);
  });

  it("completar sin staging no publica", async () => {
    const t = await started();
    expect(await t.store.completeTurn({ ownerId: ANA, claim: t.ref, agentContent: "Listo", audit })).toEqual({ status: "not_staged" });
  });

  it("un lease recuperado deja al intento viejo fuera (fencing) y descarta su staging", async () => {
    let clock = 0;
    const t = await started(() => clock);
    await stage(t.store, t.ref);

    clock = 91_000;
    const retry = await t.store.claimTurn({ ownerId: ANA, documentId: DOC, clientMessageId: "msg-cliente-0001", fingerprint: "f", leaseSeconds: 90, audit });

    expect(retry).toMatchObject({ status: "claimed", retried: true, turn: { attempt: 2 } });
    expect(await stage(t.store, t.ref)).toEqual({ status: "stale" });
    expect(await t.store.completeTurn({ ownerId: ANA, claim: t.ref, agentContent: "Listo", audit })).toEqual({ status: "stale" });
  });

  it("una respuesta de completar perdida igualmente confirmó el turno", async () => {
    const t = await started();
    await stage(t.store, t.ref);
    t.hooks.loseCompleteResponse = true;

    await expect(t.store.completeTurn({ ownerId: ANA, claim: t.ref, agentContent: "Listo", audit })).rejects.toThrow();

    expect(await t.store.completeTurn({ ownerId: ANA, claim: t.ref, agentContent: "Listo", audit })).toMatchObject({ status: "replayed" });
    expect(t.drafts.get(DOC)?.draftRevision).toBe(1);
  });
});

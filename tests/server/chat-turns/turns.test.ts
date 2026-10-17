import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createMessageService } from "@/lib/documents/messages";
import type { SessionPort } from "@/lib/documents/ports";
import { createChatTurnHandler } from "@/lib/documents/turns/http";
import { agentReply, createTurnService, type TurnDeps, type TurnEvent } from "@/lib/documents/turns/service";

import { createMemoryStore } from "../documents/memory-store";

import { createMemoryDurableStore } from "./memory-durable-store";

// Datos ficticios; ni IA ni base reales.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";

type DraftReply = Awaited<ReturnType<TurnDeps["drafting"]["generateDraft"]>>;
type Cmd = Parameters<TurnDeps["drafting"]["generateDraft"]>[0];
const draftFail = (code: string, retryable = true): DraftReply => ({
  ok: false,
  error: { code, stage: "ia", retryable, correlationId: "c" },
});
/** Paso del Agente 1 doblado: `stage` hace el staging real contra el doble de persistencia. */
type Step = (cmd: Cmd, stage: (title?: string, warnings?: number) => Promise<DraftReply>) => Promise<DraftReply>;

async function setup(options: { user?: string | null; drafting?: Step; now?: () => number } = {}) {
  const mem = createMemoryStore();
  let user = options.user === undefined ? ANA : options.user;
  const session: SessionPort = { currentUserId: async () => user };
  const created = await mem.store.createDocument({
    ownerId: ANA,
    title: "Entrega",
    idempotency: { key: "doc-key-0001", fingerprint: "a".repeat(64) },
    audit: { actorScope: ANA, correlationId: "c" },
  });
  if (created.status !== "created") throw new Error("setup");
  const documentId = created.value.documentId;
  const finalized = new Set<string>();
  const owners = () => new Map(mem.inspect().documents.map((d) => [d.documentId, d.ownerId]));
  const turns = createMemoryDurableStore({ owners, now: options.now, finalized });
  const stage = (cmd: Cmd) => async (title = "Entrega de yerba", warnings = 1): Promise<DraftReply> => {
    const staged = await turns.store.stageProposal({
      ownerId: ANA,
      documentId: cmd.documentId,
      claim: cmd.claim,
      audit: { actorScope: ANA, correlationId: "c" },
      expectedDraftRevision: cmd.expectedDraftRevision,
      content: { title, body: "Cuerpo del borrador.", corrections: [] },
      proposal: { title },
      inputs: [{ ref: "m1", kind: "mensaje", id: randomUUID() }],
      modelId: "doble",
      promptVersion: "v1",
      limitations: [],
    });
    if (staged.status === "stale") return draftFail("TURN_SUPERSEDED", false);
    if (staged.status !== "staged") return draftFail("TECHNICAL_FAILURE", false);
    return {
      ok: true,
      value: { staged: staged.staged, proposal: { title, warnings: Array.from({ length: warnings }, () => ({})), notInformed: ["precio"] } },
    };
  };
  const generateDraft = vi.fn(async (cmd: Cmd) => (options.drafting ?? ((_, s) => s()))(cmd, stage(cmd)));
  const service = createTurnService({
    session,
    turns: turns.store,
    messages: createMessageService(session, mem.store),
    documents: {
      async getDocument(ownerId, id) {
        const record = await mem.store.getDocument(ownerId, id);
        return record && finalized.has(id) ? { ...record, documentStatus: "finalizado" } : record;
      },
    },
    drafting: { generateDraft },
    currentDraftRevision: async (_owner, id) => turns.drafts.get(id)?.draftRevision ?? 0,
    newCorrelationId: () => "corr-1",
  });
  const cmd = (over: Record<string, unknown> = {}) => ({
    documentId,
    clientMessageId: "msg-cliente-0001",
    content: "Entregamos 10 cajas de yerba a Almacén El Ceibo Ficticio.",
    ...over,
  });
  return { mem, turns, service, generateDraft, documentId, finalized, cmd, setUser: (u: string | null) => (user = u) };
}

async function collect(events: AsyncGenerator<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function runTurn(ctx: Awaited<ReturnType<typeof setup>>, over: Record<string, unknown> = {}, signal?: AbortSignal) {
  const started = await ctx.service.startTurn(ctx.cmd(over), signal);
  if (!started.ok) return { started, events: [] as TurnEvent[] };
  return { started, events: await collect(started.value.events) };
}

const userMessages = (ctx: Awaited<ReturnType<typeof setup>>) => ctx.mem.inspect().messages.filter((m) => m.sender === "autor");

describe("Turno normal (MVP-052)", () => {
  it("emite eventos en orden y persiste el usuario antes de la IA y la respuesta al final", async () => {
    let userSavedBeforeAi = false;
    const ctx = await setup({
      drafting: async (_cmd, stage) => {
        userSavedBeforeAi = ctxRef.mem.inspect().messages.some((m) => m.sender === "autor");
        // El staging no publica nada: ni borrador oficial ni mensaje del agente antes de completar.
        const reply = await stage("Entrega de yerba", 1);
        expect(ctxRef.turns.drafts.size).toBe(0);
        expect(ctxRef.turns.agentMessages.size).toBe(0);
        return reply;
      },
    });
    const ctxRef = ctx;
    const { events } = await runTurn(ctx);

    expect(events.map((e) => e.type)).toEqual(["turn.started", "user_message", "drafting", "draft", "agent_message", "done"]);
    expect(userSavedBeforeAi).toBe(true);
    const agent = events.find((e) => e.type === "agent_message");
    expect(agent).toMatchObject({ content: agentReply("Entrega de yerba", 1, 1) });
    // `draft` sale del resultado de completar (revisión oficial 1), no del staging.
    expect(events.find((e) => e.type === "draft")).toMatchObject({ draftRevision: 1, title: "Entrega de yerba", warnings: 1 });
    expect(ctx.turns.drafts.get(ctx.documentId)?.draftRevision).toBe(1);
    expect(ctx.turns.agentMessages.size).toBe(1);
    expect(ctx.turns.events.map((e) => e.type)).toEqual(["turn.started", "turn.completed"]);
  });

  it("propaga AbortSignal, revisión vigente y el claim explícito del intento al Agente 1", async () => {
    const ctx = await setup();
    const controller = new AbortController();
    const { started } = await runTurn(ctx, {}, controller.signal);
    const turnId = started.ok ? started.value.turn.turnId : "";
    expect(ctx.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal, expectedDraftRevision: 0, claim: { turnId, attempt: 1 } }),
    );
  });

  it("la respuesta del agente referencia el borrador sin incrustar su contenido", () => {
    expect(agentReply("Medición", 0, 0)).toBe("Preparé el borrador «Medición».");
    expect(agentReply("X", 2, 3)).toBe("Preparé el borrador «X». Tiene 2 advertencias para revisar. 3 datos figuran como «no informado».");
  });
});

describe("Errores y cancelación (MVP-052)", () => {
  it("error del proveedor: evento de error, intento fallido, usuario conservado y ninguna respuesta", async () => {
    const ctx = await setup({ drafting: async () => draftFail("AI_TIMEOUT") });
    const { events } = await runTurn(ctx);
    expect(events.map((e) => e.type)).toEqual(["turn.started", "user_message", "drafting", "error"]);
    expect(events.at(-1)).toMatchObject({ error: { code: "AI_TIMEOUT", retryable: true } });
    expect(userMessages(ctx)).toHaveLength(1);
    expect(ctx.turns.agentMessages.size).toBe(0);
    expect(ctx.turns.events.at(-1)?.type).toBe("turn.failed");
  });

  it("error al inicio (no se pudo guardar el mensaje): no llama a la IA", async () => {
    const ctx = await setup();
    ctx.mem.failNextWrite();
    const { events } = await runTurn(ctx);
    expect(events.map((e) => e.type)).toEqual(["turn.started", "error"]);
    expect(ctx.generateDraft).not.toHaveBeenCalled();
  });

  it("cancelar a mitad: intento cancelado, sin parcial oficial y el usuario sigue guardado", async () => {
    const controller = new AbortController();
    const ctx = await setup({
      drafting: async () => {
        controller.abort();
        return draftFail("AI_ABORTED");
      },
    });
    const { events } = await runTurn(ctx, {}, controller.signal);
    expect(events.at(-1)).toEqual({ type: "cancelled" });
    expect(userMessages(ctx)).toHaveLength(1);
    expect(ctx.turns.agentMessages.size).toBe(0);
    expect(ctx.turns.events.at(-1)?.type).toBe("turn.cancelled");
  });

  it("cancelar después del staging: no completa, no hay borrador ni mensaje oficial", async () => {
    const controller = new AbortController();
    const ctx = await setup({
      drafting: async (_cmd, stage) => {
        const reply = await stage();
        controller.abort();
        return reply;
      },
    });
    const { events } = await runTurn(ctx, {}, controller.signal);
    expect(events.at(-1)).toEqual({ type: "cancelled" });
    expect(ctx.turns.calls.stage).toBe(1);
    expect(ctx.turns.calls.complete).toBe(0);
    expect(ctx.turns.drafts.size).toBe(0);
    expect(ctx.turns.agentMessages.size).toBe(0);
    expect(ctx.turns.events.filter((e) => e.type === "turn.cancelled")).toHaveLength(1);
  });

  it("documento finalizado: conserva al usuario y no llama a la IA ni publica", async () => {
    const ctx = await setup();
    ctx.finalized.add(ctx.documentId);
    const { events } = await runTurn(ctx);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "DOCUMENT_FINALIZED", retryable: false } });
    expect(ctx.generateDraft).not.toHaveBeenCalled();
    expect(userMessages(ctx)).toHaveLength(1);
    expect(ctx.turns.drafts.size).toBe(0);
  });

  it("el documento se finaliza durante la IA: completar no publica y el error es explícito", async () => {
    const ctx = await setup({
      drafting: async (_cmd, stage) => {
        const reply = await stage();
        ctx.finalized.add(ctx.documentId);
        return reply;
      },
    });
    const { events } = await runTurn(ctx);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "DOCUMENT_FINALIZED" } });
    expect(events.map((e) => e.type)).not.toContain("draft");
    expect(ctx.turns.drafts.size).toBe(0);
    expect(ctx.turns.agentMessages.size).toBe(0);
  });

  it("el borrador oficial cambió durante la IA (CAS): sin éxito ni publicación", async () => {
    const ctx = await setup({
      drafting: async (_cmd, stage) => {
        const reply = await stage();
        ctx.turns.drafts.set(ctx.documentId, { draftId: randomUUID(), documentId: ctx.documentId, draftRevision: 5, content: { title: "otro", body: "x", corrections: [] }, updatedAt: "2026-10-16T16:00:00Z" });
        return reply;
      },
    });
    const { events } = await runTurn(ctx);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "STALE_DRAFT" } });
    expect(ctx.turns.agentMessages.size).toBe(0);
    expect(ctx.turns.drafts.get(ctx.documentId)?.draftRevision).toBe(5);
    expect(ctx.turns.events.filter((e) => e.type === "turn.failed")).toHaveLength(1);
  });

  it("cancelado antes de la IA: no la llama", async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = await setup();
    const { events } = await runTurn(ctx, {}, controller.signal);
    expect(events.at(-1)).toEqual({ type: "cancelled" });
    expect(ctx.generateDraft).not.toHaveBeenCalled();
  });
});

describe("Reintento, doble envío e idempotencia (MVP-052)", () => {
  it("reintento tras fallo: mismo mensaje de usuario, nuevo intento y una sola respuesta", async () => {
    const replies: Step[] = [async () => draftFail("AI_TIMEOUT"), (_cmd, stage) => stage()];
    const ctx = await setup({ drafting: (cmd, stage) => replies.shift()!(cmd, stage) });
    await runTurn(ctx);
    const { events } = await runTurn(ctx);
    expect(events[0]).toMatchObject({ type: "turn.started", attempt: 2, retried: true });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(userMessages(ctx)).toHaveLength(1);
    expect(ctx.turns.agentMessages.size).toBe(1);
  });

  it("turno ya completado: devuelve la respuesta existente sin llamar a la IA", async () => {
    const ctx = await setup();
    const first = await runTurn(ctx);
    const again = await runTurn(ctx);
    expect(again.started).toMatchObject({ ok: true, replayed: true });
    expect(again.events.map((e) => e.type)).toEqual(["draft", "agent_message", "done"]);
    expect(again.events[1]).toEqual(first.events.find((e) => e.type === "agent_message"));
    expect(again.events[0]).toMatchObject({ draftRevision: 1, title: "Entrega de yerba" });
    expect(ctx.generateDraft).toHaveBeenCalledTimes(1);
    // El replay sale de `completeTurn` del intento completado y no republica.
    expect(ctx.turns.calls.complete).toBe(2);
    expect(ctx.turns.drafts.get(ctx.documentId)?.draftRevision).toBe(1);
  });

  it("respuesta de completar perdida: el reintento recupera el resultado original sin reejecutar la IA", async () => {
    const ctx = await setup();
    ctx.turns.hooks.loseCompleteResponse = true;
    const first = await runTurn(ctx);
    expect(first.events.at(-1)).toMatchObject({ type: "error", error: { code: "TECHNICAL_FAILURE", retryable: true } });
    const committed = ctx.turns.drafts.get(ctx.documentId)!;
    expect(committed.draftRevision).toBe(1);
    // Cerrar tras la respuesta perdida no toca el turno ya completado.
    expect(ctx.turns.events.map((e) => e.type)).toEqual(["turn.started", "turn.completed"]);

    const again = await runTurn(ctx);
    expect(again.started).toMatchObject({ ok: true, replayed: true });
    expect(again.events[0]).toMatchObject({ type: "draft", draftId: committed.draftId, draftRevision: 1 });
    expect(again.events.at(-1)).toEqual({ type: "done" });
    expect(ctx.generateDraft).toHaveBeenCalledTimes(1);
    expect(ctx.turns.agentMessages.size).toBe(1);
  });

  it("doble envío con un intento vigente: «en curso», sin duplicar", async () => {
    let release!: () => void;
    const ctx = await setup({ drafting: (_cmd, stage) => new Promise<DraftReply>((resolve) => (release = () => resolve(stage()))) });
    const first = await ctx.service.startTurn(ctx.cmd());
    if (!first.ok) throw new Error("inicio");
    const iterating = collect(first.value.events);
    await vi.waitFor(() => expect(ctx.generateDraft).toHaveBeenCalled());

    const second = await ctx.service.startTurn(ctx.cmd());
    expect(second).toMatchObject({ ok: false, error: { code: "TURN_IN_PROGRESS", retryable: true } });
    release();
    await iterating;
    expect(userMessages(ctx)).toHaveLength(1);
    expect(ctx.turns.agentMessages.size).toBe(1);
  });

  it("claim vencido (el servidor no llegó a escribir la cancelación): el reintento lo recupera", async () => {
    let clock = Date.parse("2026-10-16T16:00:00Z");
    const replies: Step[] = [() => new Promise<DraftReply>(() => {}), (_cmd, stage) => stage()];
    const ctx = await setup({ drafting: (cmd, stage) => replies.shift()!(cmd, stage), now: () => clock });
    const first = await ctx.service.startTurn(ctx.cmd());
    if (!first.ok) throw new Error("inicio");
    void collect(first.value.events);
    await vi.waitFor(() => expect(ctx.generateDraft).toHaveBeenCalled());

    clock += 91_000;
    const { events } = await runTurn(ctx);
    expect(events[0]).toMatchObject({ attempt: 2, retried: true });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(ctx.turns.agentMessages.size).toBe(1);
  });

  it("un intento viejo que termina tarde no publica una segunda respuesta", async () => {
    let clock = Date.parse("2026-10-16T16:00:00Z");
    let releaseOld!: () => void;
    const replies: Step[] = [
      (_cmd, stage) => new Promise<DraftReply>((resolve) => (releaseOld = () => resolve(stage("viejo")))),
      (_cmd, stage) => stage("nuevo"),
    ];
    const ctx = await setup({ drafting: (cmd, stage) => replies.shift()!(cmd, stage), now: () => clock });
    const old = await ctx.service.startTurn(ctx.cmd());
    if (!old.ok) throw new Error("inicio");
    const oldEvents = collect(old.value.events);
    await vi.waitFor(() => expect(ctx.generateDraft).toHaveBeenCalled());
    clock += 91_000;
    await runTurn(ctx);
    releaseOld();
    expect((await oldEvents).at(-1)).toMatchObject({ type: "error", error: { code: "TURN_SUPERSEDED" } });
    expect(ctx.turns.agentMessages.size).toBe(1);
    expect([...ctx.turns.agentMessages.values()][0].content).toContain("nuevo");
    // El worker viejo no deja staging oficial: solo el intento vigente publicó.
    expect(ctx.turns.drafts.get(ctx.documentId)).toMatchObject({ draftRevision: 1, content: { title: "nuevo" } });
  });

  it("misma clave con otro contenido: conflicto, sin tocar nada", async () => {
    const ctx = await setup();
    await runTurn(ctx);
    const other = await ctx.service.startTurn(ctx.cmd({ content: "Otro texto" }));
    expect(other).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(userMessages(ctx)).toHaveLength(1);
  });
});

describe("Autorización y validación (MVP-052)", () => {
  it("sin sesión o documento ajeno: denegado antes del proveedor", async () => {
    const anon = await setup({ user: null });
    expect(await anon.service.startTurn(anon.cmd())).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });
    const ctx = await setup();
    ctx.setUser(LUIS);
    expect(await ctx.service.startTurn(ctx.cmd())).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(anon.generateDraft).not.toHaveBeenCalled();
    expect(ctx.generateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["mensaje vacío", { content: "   " }],
    ["más de 8000 caracteres", { content: "x".repeat(8001) }],
    ["clave inválida", { clientMessageId: "x" }],
    ["campo extra", { rol: "admin" }],
  ])("rechaza %s", async (_, over) => {
    const ctx = await setup();
    expect(await ctx.service.startTurn(ctx.cmd(over))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("los eventos de auditoría del turno solo llevan identificadores", async () => {
    const ctx = await setup();
    await runTurn(ctx);
    expect(JSON.stringify(ctx.turns.events)).not.toContain("yerba");
  });
});

describe("Protocolo HTTP en NDJSON (MVP-052)", () => {
  const read = async (res: Response) =>
    (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as TurnEvent);

  it("devuelve el flujo en orden con cabeceras privadas", async () => {
    const ctx = await setup();
    const handler = createChatTurnHandler(async () => ctx.service);
    const res = await handler(
      new Request("https://app.invalid/api/documents/x/chat", {
        method: "POST",
        body: JSON.stringify({ clientMessageId: "msg-cliente-0001", content: "Entregamos 10 cajas." }),
      }),
      ctx.documentId,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect((await read(res)).map((e) => e.type)).toEqual(["turn.started", "user_message", "drafting", "draft", "agent_message", "done"]);
  });

  it.each([
    ["sin sesión", { user: null }, 401],
    ["cuerpo inválido", {}, 400],
  ] as const)("%s → %i con envelope", async (_, opts, status) => {
    const ctx = await setup(opts);
    const handler = createChatTurnHandler(async () => ctx.service);
    const res = await handler(new Request("https://app.invalid/x", { method: "POST", body: status === 400 ? "no-json" : JSON.stringify({ clientMessageId: "msg-cliente-0001", content: "hola" }) }), ctx.documentId);
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error: { stage: expect.any(String) } });
  });

  it("el documento sale de la ruta, no del cuerpo", async () => {
    const ctx = await setup();
    const handler = createChatTurnHandler(async () => ctx.service);
    const res = await handler(
      new Request("https://app.invalid/x", { method: "POST", body: JSON.stringify({ documentId: "otro", clientMessageId: "msg-cliente-0001", content: "hola" }) }),
      ctx.documentId,
    );
    expect(res.status).toBe(200);
    await res.text();
  });
});


describe("Cancelación del flujo y claves de mensaje (MVP-052)", () => {
  const post = (documentId: string, signal?: AbortSignal, id = "msg-cliente-0001") =>
    new Request("https://app.invalid/x", { method: "POST", signal, body: JSON.stringify({ clientMessageId: id, content: "Entregamos 10 cajas." }) });

  it("cancelar el consumidor aborta al proveedor pendiente, cierra el intento y conserva al usuario", async () => {
    let providerAborted = false;
    const ctx = await setup({
      drafting: ({ abortSignal }) =>
        new Promise<DraftReply>((resolve) => {
          abortSignal?.addEventListener("abort", () => {
            providerAborted = true;
            resolve(draftFail("AI_ABORTED"));
          });
        }),
    });
    const handler = createChatTurnHandler(async () => ctx.service);
    const res = await handler(post(ctx.documentId), ctx.documentId);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (let seen = ""; !seen.includes('"drafting"'); ) seen += decoder.decode((await reader.read()).value);
    const pending = reader.read(); // las siguientes lecturas hacen avanzar el turno
    await vi.waitFor(() => expect(ctx.generateDraft).toHaveBeenCalled());

    await Promise.race([reader.cancel(), new Promise((_, rej) => setTimeout(() => rej(new Error("cancel colgado")), 2000))]);

    expect((await pending).done).toBe(true);
    expect(providerAborted).toBe(true);
    const closed = ctx.turns.events.filter((e) => e.type === "turn.cancelled");
    expect(closed).toHaveLength(1);
    expect(userMessages(ctx)).toHaveLength(1);
    expect(ctx.turns.agentMessages.size).toBe(0);
  });

  it("abortar la petición antes de cargar no llama a la IA; el flujo normal no se marca cancelado", async () => {
    const early = await setup();
    const controller = new AbortController();
    controller.abort();
    const handler = createChatTurnHandler(async () => early.service);
    const aborted = await handler(new Request("https://app.invalid/x", { method: "POST", signal: controller.signal, body: JSON.stringify({ clientMessageId: "msg-cliente-0002", content: "hola" }) }), early.documentId);
    await aborted.text();
    expect(early.generateDraft).not.toHaveBeenCalled();
    expect(early.turns.events.at(-1)?.type).toBe("turn.cancelled");

    const normal = await setup();
    const ok = await createChatTurnHandler(async () => normal.service)(post(normal.documentId), normal.documentId);
    expect(await ok.text()).toContain('"done"');
    expect(normal.turns.events.map((e) => e.type)).toEqual(["turn.started", "turn.completed"]);
  });

  it("dos ids de 128 caracteres con el mismo prefijo no colisionan; el reintento repite la clave", async () => {
    const a = "a".repeat(127) + "X";
    const b = "a".repeat(127) + "Y";
    const ctx = await setup();
    await runTurn(ctx, { clientMessageId: a });
    await runTurn(ctx, { clientMessageId: b });
    expect(userMessages(ctx)).toHaveLength(2);
    await runTurn(ctx, { clientMessageId: a });
    expect(userMessages(ctx)).toHaveLength(2);
  });
});

import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/contracts/core";
import { createMessageService } from "@/lib/documents/messages";
import type { SessionPort } from "@/lib/documents/ports";
import { createChatTurnHandler } from "@/lib/documents/turns/http";
import type { TurnRecord, TurnStore } from "@/lib/documents/turns/ports";
import { agentReply, createTurnService, type TurnDeps, type TurnEvent } from "@/lib/documents/turns/service";

import { createMemoryStore } from "../documents/memory-store";

// Datos ficticios; ni IA ni base reales.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";

/** Doble de la operación de turno: claim con vencimiento, un intento vigente, una respuesta. */
function memoryTurns(documents: () => Map<string, string>, options: { now?: () => number } = {}) {
  const now = options.now ?? (() => Date.now());
  const turns = new Map<string, TurnRecord & { fingerprint: string; ownerId: string }>();
  const agentMessages = new Map<string, Message>();
  const events: { type: string; turnId: string; attempt: number }[] = [];

  const store: TurnStore = {
    async claimTurn(input) {
      if (documents().get(input.documentId) !== input.ownerId) return { status: "not_available" };
      const key = `${input.ownerId}|${input.clientMessageId}`;
      const lease = () => new Date(now() + input.leaseSeconds * 1000).toISOString();
      const t = turns.get(key);
      if (!t) {
        const turn = {
          turnId: randomUUID(),
          documentId: input.documentId,
          clientMessageId: input.clientMessageId,
          attempt: 1,
          state: "en_curso" as const,
          userMessageId: null,
          agentMessageId: null,
          leaseExpiresAt: lease(),
          fingerprint: input.fingerprint,
          ownerId: input.ownerId,
        };
        turns.set(key, turn);
        events.push({ type: "turn.started", turnId: turn.turnId, attempt: 1 });
        return { status: "claimed", turn, retried: false };
      }
      if (t.fingerprint !== input.fingerprint || t.documentId !== input.documentId) return { status: "idempotency_conflict" };
      if (t.state === "completado") return { status: "completed", turn: t, agentMessage: agentMessages.get(t.turnId)! };
      if (t.state === "en_curso" && Date.parse(t.leaseExpiresAt!) > now()) return { status: "in_progress", turn: t };
      Object.assign(t, { attempt: t.attempt + 1, state: "en_curso", leaseExpiresAt: lease() });
      events.push({ type: "turn.retried", turnId: t.turnId, attempt: t.attempt });
      return { status: "claimed", turn: { ...t }, retried: true };
    },
    async attachUserMessage({ turnId, userMessageId }) {
      const t = [...turns.values()].find((x) => x.turnId === turnId)!;
      t.userMessageId = userMessageId;
    },
    async completeTurn(input) {
      const t = [...turns.values()].find((x) => x.turnId === input.turnId)!;
      if (t.attempt !== input.attempt || t.state !== "en_curso") return { status: "stale" };
      const message: Message = {
        messageId: randomUUID(),
        documentId: t.documentId,
        sender: "agente",
        content: input.agentContent,
        declaredEventDate: { kind: "unknown" },
        uploadedAt: new Date(now()).toISOString(),
      };
      agentMessages.set(t.turnId, message);
      Object.assign(t, { state: "completado", agentMessageId: message.messageId, leaseExpiresAt: null });
      events.push({ type: "turn.completed", turnId: t.turnId, attempt: t.attempt });
      return { status: "completed", agentMessage: message };
    },
    async closeAttempt(input) {
      const t = [...turns.values()].find((x) => x.turnId === input.turnId)!;
      if (t.attempt !== input.attempt || t.state !== "en_curso") return;
      Object.assign(t, { state: input.state, leaseExpiresAt: null });
      events.push({ type: input.state === "cancelado" ? "turn.cancelled" : "turn.failed", turnId: t.turnId, attempt: t.attempt });
    },
  };
  return { store, turns, agentMessages, events };
}

type DraftReply = Awaited<ReturnType<TurnDeps["drafting"]["generateDraft"]>>;
const draftOk = (title = "Entrega de yerba", warnings = 1): DraftReply => ({
  ok: true,
  value: {
    draft: { draftId: randomUUID(), draftRevision: 1, content: { title } },
    proposalId: randomUUID(),
    proposal: { warnings: Array.from({ length: warnings }, () => ({})), notInformed: ["precio"] },
  },
});
const draftFail = (code: string, retryable = true): DraftReply => ({
  ok: false,
  error: { code, stage: "ia", retryable, correlationId: "c" },
});

async function setup(options: { user?: string | null; drafting?: TurnDeps["drafting"]["generateDraft"]; now?: () => number } = {}) {
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
  const owners = () => new Map(mem.inspect().documents.map((d) => [d.documentId, d.ownerId]));
  const turns = memoryTurns(owners, { now: options.now });
  const generateDraft = vi.fn(options.drafting ?? (async () => draftOk()));
  const service = createTurnService({
    session,
    turns: turns.store,
    messages: createMessageService(session, mem.store),
    drafting: { generateDraft },
    currentDraftRevision: async () => 0,
    newCorrelationId: () => "corr-1",
  });
  const cmd = (over: Record<string, unknown> = {}) => ({
    documentId,
    clientMessageId: "msg-cliente-0001",
    content: "Entregamos 10 cajas de yerba a Almacén El Ceibo Ficticio.",
    ...over,
  });
  return { mem, turns, service, generateDraft, documentId, cmd, setUser: (u: string | null) => (user = u) };
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
      drafting: async () => {
        userSavedBeforeAi = ctxRef.mem.inspect().messages.some((m) => m.sender === "autor");
        return draftOk("Entrega de yerba", 1);
      },
    });
    const ctxRef = ctx;
    const { events } = await runTurn(ctx);

    expect(events.map((e) => e.type)).toEqual(["turn.started", "user_message", "drafting", "draft", "agent_message", "done"]);
    expect(userSavedBeforeAi).toBe(true);
    const agent = events.find((e) => e.type === "agent_message");
    expect(agent).toMatchObject({ content: agentReply("Entrega de yerba", 1, 1) });
    expect(ctx.turns.agentMessages.size).toBe(1);
    expect(ctx.turns.events.map((e) => e.type)).toEqual(["turn.started", "turn.completed"]);
  });

  it("propaga el AbortSignal y la revisión vigente al Agente 1", async () => {
    const ctx = await setup();
    const controller = new AbortController();
    await runTurn(ctx, {}, controller.signal);
    expect(ctx.generateDraft).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: controller.signal, expectedDraftRevision: 0 }));
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
    const replies = [draftFail("AI_TIMEOUT"), draftOk()];
    const ctx = await setup({ drafting: async () => replies.shift()! });
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
    expect(again.events.map((e) => e.type)).toEqual(["agent_message", "done"]);
    expect(again.events[0]).toEqual(first.events.find((e) => e.type === "agent_message"));
    expect(ctx.generateDraft).toHaveBeenCalledTimes(1);
  });

  it("doble envío con un intento vigente: «en curso», sin duplicar", async () => {
    let release!: () => void;
    const ctx = await setup({ drafting: () => new Promise<DraftReply>((resolve) => (release = () => resolve(draftOk()))) });
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
    const replies: (() => Promise<DraftReply>)[] = [() => new Promise<DraftReply>(() => {}), async () => draftOk()];
    const ctx = await setup({ drafting: () => replies.shift()!(), now: () => clock });
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
    const replies: (() => Promise<DraftReply>)[] = [
      () => new Promise<DraftReply>((resolve) => (releaseOld = () => resolve(draftOk("viejo")))),
      async () => draftOk("nuevo"),
    ];
    const ctx = await setup({ drafting: () => replies.shift()!(), now: () => clock });
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


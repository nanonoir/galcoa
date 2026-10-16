import { describe, expect, it } from "vitest";

import type { ConfirmationStatus } from "@/lib/contracts/document";
import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";
import { computeAggregate, summarize, type AggregateResponse } from "@/lib/documents/confirmations/aggregate";
import type { AggregateStore, RateLimitStore, RevisionState } from "@/lib/documents/confirmations/ports";
import { createRateLimiter, DEFAULT_RATE_LIMITS, originOf } from "@/lib/documents/confirmations/rate-limit";
import { createAggregateService } from "@/lib/documents/confirmations/service";

// Datos ficticios; ni base ni red reales.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const SNAP = "snap-1";

const SELECTIONS: ParticipantSelection[] = [["autor"], ["autor", "intermediario"], ["autor", "comprador"], ["autor", "intermediario", "comprador"]];

type Answer = "ninguna" | "confirmado" | "rechazado";
const ANSWERS: Answer[] = ["ninguna", "confirmado", "rechazado"];

/** Todas las combinaciones de respuesta por rol (3^n) de una selección. */
function combos(selection: ParticipantSelection): Answer[][] {
  return selection.reduce<Answer[][]>((acc) => acc.flatMap((prefix) => ANSWERS.map((a) => [...prefix, a])), [[]]);
}

/** Matriz esperada, escrita aparte del motor: la regla del PRD §5 / review-confirmation §4. */
function expected(answers: Answer[], superseded: boolean): ConfirmationStatus {
  if (superseded) return "sustituida";
  if (answers.includes("rechazado")) return "rechazada";
  if (answers.every((a) => a === "confirmado")) return "completa";
  return answers.every((a) => a === "ninguna") ? "pendiente" : "parcial";
}

const responsesOf = (selection: ParticipantSelection, answers: Answer[], snapshotId = SNAP): AggregateResponse[] =>
  selection.flatMap((role, i) => (answers[i] === "ninguna" ? [] : [{ role, response: answers[i] as "confirmado" | "rechazado", snapshotId }]));

describe("MVP-075 · paridad del agregado con la matriz", () => {
  for (const selection of SELECTIONS) {
    it(`todas las respuestas de ${selection.join(" + ")}, vigente y sustituida`, () => {
      for (const answers of combos(selection)) {
        for (const superseded of [false, true]) {
          const agg = computeAggregate({ revisionId: "rev-1", snapshotId: SNAP, selection, responses: responsesOf(selection, answers), superseded });
          expect(agg.confirmationStatus, `${answers.join(",")} sustituida=${superseded}`).toBe(expected(answers, superseded));
        }
      }
    });
  }

  it("filas literales de la matriz", () => {
    const row = (selection: ParticipantSelection, answers: Answer[], status: ConfirmationStatus) =>
      expect(computeAggregate({ revisionId: "r", snapshotId: SNAP, selection, responses: responsesOf(selection, answers), superseded: false }).confirmationStatus).toBe(status);
    row(["autor"], ["ninguna"], "pendiente");
    row(["autor"], ["confirmado"], "completa");
    row(["autor", "comprador"], ["confirmado", "ninguna"], "parcial");
    row(["autor", "comprador"], ["confirmado", "confirmado"], "completa");
    row(["autor", "comprador"], ["confirmado", "rechazado"], "rechazada");
    row(["autor", "intermediario", "comprador"], ["ninguna", "confirmado", "confirmado"], "parcial");
    row(["autor", "intermediario", "comprador"], ["confirmado", "confirmado", "confirmado"], "completa");
  });

  it("un rechazo impide finalizar y permite otra revisión; completa permite finalizar", () => {
    const sel: ParticipantSelection = ["autor", "comprador"];
    const rejected = computeAggregate({ revisionId: "r", snapshotId: SNAP, selection: sel, responses: responsesOf(sel, ["confirmado", "rechazado"]), superseded: false });
    expect(rejected).toMatchObject({ canFinalize: false, canCreateNewRevision: true, rejected: 1, summary: "Revisión rechazada", provenance: null });
    const done = computeAggregate({ revisionId: "r", snapshotId: SNAP, selection: sel, responses: responsesOf(sel, ["confirmado", "confirmado"]), superseded: false });
    expect(done).toMatchObject({ canFinalize: true, canCreateNewRevision: false, provenance: "declarado_y_corroborado_por_tercero", missingRoles: [] });
    const alone = computeAggregate({ revisionId: "r", snapshotId: SNAP, selection: ["autor"], responses: responsesOf(["autor"], ["confirmado"]), superseded: false });
    expect(alone).toMatchObject({ canFinalize: true, provenance: "declarado_por_autor" });
  });

  it("la sustitución cierra la revisión: no finaliza y pide nuevas confirmaciones", () => {
    const sel: ParticipantSelection = ["autor", "comprador"];
    const agg = computeAggregate({ revisionId: "r", snapshotId: SNAP, selection: sel, responses: responsesOf(sel, ["confirmado", "confirmado"]), superseded: true });
    expect(agg).toMatchObject({ confirmationStatus: "sustituida", canFinalize: false, canCreateNewRevision: true, summary: "Revisión sustituida: requiere nuevas confirmaciones" });
  });

  it("solo cuentan las respuestas del snapshot vigente: nada se hereda de otro", () => {
    const sel: ParticipantSelection = ["autor", "comprador"];
    const agg = computeAggregate({
      revisionId: "r",
      snapshotId: SNAP,
      selection: sel,
      responses: [...responsesOf(sel, ["confirmado", "confirmado"], "snap-viejo")],
      superseded: false,
    });
    expect(agg).toMatchObject({ confirmationStatus: "pendiente", confirmed: 0, canFinalize: false });
    expect(agg.revisionId).toBe("r");
    expect(agg.snapshotId).toBe(SNAP);
  });

  it("resúmenes del avance", () => {
    expect(summarize("parcial", 1, 2)).toBe("Confirmaron 1 de 2. Faltan confirmaciones");
    expect(summarize("completa", 3, 3)).toBe("Confirmaron 3 de 3");
    expect(summarize("pendiente", 0, 2)).toContain("Faltan confirmaciones");
  });

  it("una respuesta de un rol no seleccionado o duplicada es un error explícito, no un valor por defecto", () => {
    expect(() =>
      computeAggregate({ revisionId: "r", snapshotId: SNAP, selection: ["autor"], responses: [{ role: "comprador" as ParticipantRole, response: "confirmado", snapshotId: SNAP }], superseded: false }),
    ).toThrow();
    expect(() =>
      computeAggregate({
        revisionId: "r",
        snapshotId: SNAP,
        selection: ["autor"],
        responses: [
          { role: "autor", response: "confirmado", snapshotId: SNAP },
          { role: "autor", response: "rechazado", snapshotId: SNAP },
        ],
        superseded: false,
      }),
    ).toThrow();
  });
});

describe("MVP-075 · lectura del agregado para el autor", () => {
  const state: RevisionState = {
    revisionId: "rev-1",
    snapshotId: SNAP,
    documentId: "doc-1",
    selection: ["autor", "comprador"],
    superseded: false,
    responses: [{ role: "autor", response: "confirmado", snapshotId: SNAP, respondedAt: "2026-10-16T12:00:00Z" }],
  };
  const store = (override: Partial<AggregateStore> = {}): AggregateStore => ({
    async getRevisionState(ownerId, revisionId) {
      return ownerId === ANA && revisionId === "rev-1" ? state : null;
    },
    ...override,
  });
  const make = (user: string | null, s = store()) => createAggregateService({ session: { currentUserId: async () => user }, store: s, newCorrelationId: () => "corr-1" });

  it("calcula en servidor y atribuye el estado a su revisión y snapshot", async () => {
    expect(await make(ANA).getForAuthor("rev-1")).toMatchObject({
      ok: true,
      value: { revisionId: "rev-1", snapshotId: SNAP, confirmationStatus: "parcial", confirmed: 1, required: 2, missingRoles: ["comprador"], canFinalize: false },
    });
  });

  it("sin sesión, ajena o inexistente (igual), entrada inválida y falla de base", async () => {
    expect(await make(null).getForAuthor("rev-1")).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });
    const foreign = await make(LUIS).getForAuthor("rev-1");
    const missing = await make(ANA).getForAuthor("no-existe");
    expect(foreign).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(missing).toEqual(foreign);
    expect(await make(ANA).getForAuthor(42)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const broken = make(ANA, store({ getRevisionState: async () => Promise.reject(new Error("caída")) }));
    expect(await broken.getForAuthor("rev-1")).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
  });
});

/** Contador de ventana fija en memoria, como el que hará Postgres. */
function memoryCounter() {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const store: RateLimitStore = {
    async hit({ kind, originHash, windowStart }) {
      const key = `${kind}|${originHash}|${windowStart}`;
      keys.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return { count: counts.get(key)! };
    },
  };
  return { store, keys };
}

const req = (ip?: string, path = "http://localhost/api/confirm/TOKEN-NO-DEBE-IR") =>
  new Request(path, { headers: ip ? { "x-forwarded-for": `${ip}, 10.0.0.1` } : {} });

describe("MVP-075 · límite de abuso", () => {
  it("valores aprobados: 60 lecturas y 10 escrituras por minuto", () => {
    expect(DEFAULT_RATE_LIMITS).toEqual({ read: { limit: 60, windowSeconds: 60 }, write: { limit: 10, windowSeconds: 60 } });
  });

  it("deja pasar hasta el límite y después 429 con Retry-After, sin ejecutar el handler", async () => {
    const { store } = memoryCounter();
    const now = Date.parse("2026-10-16T12:00:30Z");
    const limiter = createRateLimiter({ store, now: () => now });
    let calls = 0;
    const handler = limiter.limited("write", async () => {
      calls += 1;
      return Response.json({ ok: true });
    });
    for (let i = 0; i < 10; i += 1) expect((await handler(req("1.1.1.1"))).status).toBe(200);
    const blocked = await handler(req("1.1.1.1"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("30");
    expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED", retryable: true } });
    expect(calls).toBe(10);
  });

  it("otra ventana o otro origen empiezan de cero; lectura y escritura cuentan por separado", async () => {
    const { store } = memoryCounter();
    let now = Date.parse("2026-10-16T12:00:10Z");
    const limiter = createRateLimiter({ store, now: () => now, limits: { write: { limit: 1, windowSeconds: 60 } } });
    const write = limiter.limited("write", async () => new Response("ok"));
    const read = limiter.limited("read", async () => new Response("ok"));
    expect((await write(req("1.1.1.1"))).status).toBe(200);
    expect((await write(req("1.1.1.1"))).status).toBe(429);
    expect((await write(req("2.2.2.2"))).status).toBe(200);
    expect((await read(req("1.1.1.1"))).status).toBe(200);
    now += 60_000;
    expect((await write(req("1.1.1.1"))).status).toBe(200);
  });

  it("un participante legítimo no queda bloqueado para siempre: la ventana siguiente vuelve a admitir", async () => {
    const { store } = memoryCounter();
    let now = Date.parse("2026-10-16T12:00:00Z");
    const limiter = createRateLimiter({ store, now: () => now, limits: { read: { limit: 2, windowSeconds: 60 } } });
    const read = limiter.limited("read", async () => new Response("ok"));
    await read(req("3.3.3.3"));
    await read(req("3.3.3.3"));
    expect((await read(req("3.3.3.3"))).status).toBe(429);
    now += 61_000;
    expect((await read(req("3.3.3.3"))).status).toBe(200);
  });

  it("falla del contador: cierra en falla con 503 reintentable, sin bypass ni éxito ficticio", async () => {
    const limiter = createRateLimiter({ store: { hit: async () => Promise.reject(new Error("contador caído")) } });
    let ran = false;
    const res = await limiter.limited("read", async () => {
      ran = true;
      return new Response("ok");
    })(req("1.1.1.1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "RATE_LIMIT_UNAVAILABLE", retryable: true } });
    expect(ran).toBe(false);
  });

  it("la clave guarda solo el hash del origen: ni la IP ni el token en claro", async () => {
    const { store, keys } = memoryCounter();
    const limiter = createRateLimiter({ store });
    await limiter.limited("read", async () => new Response("ok"))(req("203.0.113.9"));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^read\|[0-9a-f]{64}\|\d+$/);
    expect(keys[0]).not.toContain("203.0.113.9");
    expect(keys[0]).not.toContain("TOKEN-NO-DEBE-IR");
  });

  it("el origen sale de la plataforma y sin encabezado hay un cubo único", () => {
    expect(originOf(req("203.0.113.9"))).toBe("203.0.113.9");
    expect(originOf(new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(originOf(req())).toBe("desconocido");
  });
});

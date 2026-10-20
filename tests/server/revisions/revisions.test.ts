import { describe, expect, it } from "vitest";

import type { Draft } from "@/lib/contracts/core";
import { snapshotHash } from "@/lib/documents/manifest/manifest";
import { buildFrozenSnapshot, normalizeSelection } from "@/lib/documents/revisions/freeze";
import { createAuthorConfirmationHandler, createFreezeHandler } from "@/lib/documents/revisions/http";
import type { FreezeSource } from "@/lib/documents/revisions/ports";
import { createRevisionService } from "@/lib/documents/revisions/service";
import type { ConsolidatedWarning } from "@/lib/rules/consolidate";

import { fakeAlc, fakeEvaluation } from "./alc-double";
import { createMemoryRevisions } from "./memory-revisions";

// Datos ficticios; ni base ni IA reales.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const DOC = "doc-1";

const draft = (over: Partial<Draft> & { body?: string } = {}): Draft => ({
  draftId: "d-1",
  documentId: DOC,
  draftRevision: 3,
  content: { title: "Acuerdo ficticio", body: over.body ?? "Se entregan 12 cajas de ejemplo.", corrections: [] },
  updatedAt: "2026-10-16T12:00:00Z",
  ...("draftRevision" in over ? { draftRevision: over.draftRevision } : {}),
});

const critical: ConsolidatedWarning = {
  key: "3|code:cantidad_contradictoria|e1,m1",
  origins: ["reglas"],
  draftRevision: 3,
  severity: "critical",
  messages: ["Las fuentes no coinciden: 10 cajas (m1) y 12 cajas (e1)."],
  sources: ["e1", "m1"],
};

const source = (over: Partial<FreezeSource> = {}): FreezeSource => ({
  draft: draft(),
  warnings: [critical],
  sourceDescriptions: { m1: "chat: 10 cajas", e1: "remito aportado: 12 cajas" },
  sourceRefs: { m1: { kind: "mensaje", id: "msg-1" }, e1: { kind: "evidencia", id: "evi-1" } },
  controlStatus: "contradiccion_critica",
  ...over,
});

function setup(user: string | null = ANA, alc = fakeAlc()) {
  const mem = createMemoryRevisions();
  mem.seed(ANA, DOC, source());
  let n = 0;
  const service = createRevisionService({
    session: { currentUserId: async () => user },
    source: mem.reader,
    revisions: mem.store,
    alc,
    newCorrelationId: () => `corr-${++n}`,
  });
  return { mem, service, alc };
}

const freeze = (over: Record<string, unknown> = {}) => ({
  documentId: DOC,
  expectedDraftRevision: 3,
  selection: ["comprador"],
  idempotencyKey: "freeze-key-0001",
  ...over,
});

describe("MVP-070 · selección y congelado puro", () => {
  it.each([
    [["comprador"], ["autor", "comprador"]],
    [["comprador", "intermediario"], ["autor", "intermediario", "comprador"]],
    [["autor", "comprador", "comprador"], ["autor", "comprador"]],
  ])("normaliza %j → %j", (input, expected) => {
    expect(normalizeSelection(input)).toEqual(expected);
  });

  it.each([[[]], [["intermediario"]], [["autor"]]])("sin comprador %j no es una selección válida", (input) => {
    expect(normalizeSelection(input)).toBeNull();
  });

  it("un rol desconocido no es una selección", () => {
    expect(normalizeSelection(["comprador", "escribano"])).toBeNull();
  });

  it("el hash es el JCS del contenido y el DTO usa alias, sin refs privadas", async () => {
    const frozen = buildFrozenSnapshot({
      content: draft().content,
      warnings: [critical],
      describeSource: (ref) => ({ m1: "chat: 10 cajas", e1: "remito aportado: 12 cajas" })[ref] ?? "",
      evaluation: fakeEvaluation(),
    });
    expect(frozen.snapshotHash).toBe(snapshotHash(frozen.content).hash);
    expect(JSON.stringify(frozen.content)).not.toMatch(/\b[me]\d+\b/);
    expect(frozen.content.warnings[0].sources.map((s) => s.alias)).toEqual(["Fuente A", "Fuente B"]);
    expect(frozen.aliasTable).toEqual([
      { alias: "Fuente A", ref: "e1" },
      { alias: "Fuente B", ref: "m1" },
    ]);
    expect(Object.keys(frozen.content).sort()).toEqual(["alc", "operation", "rectifications", "selection", "warnings"]);
  });
});

describe("MVP-070 · congelar la revisión", () => {
  it("congela con una advertencia crítica: no bloquea", async () => {
    const { service } = setup();
    const r = await service.freeze(freeze());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.revision).toMatchObject({ selection: ["autor", "comprador"], frozenFromDraftRevision: 3, supersedesRevisionId: null, confirmationStatus: "pendiente" });
    expect(r.value.snapshot.content.warnings).toHaveLength(1);
    expect(r.value.snapshot.snapshotHash).toBe(snapshotHash(r.value.snapshot.content).hash);
  });

  it("el snapshot es el mismo para el autor y los terceros: sin chat ni ids privados", async () => {
    const { service } = setup();
    const r = await service.freeze(freeze());
    if (!r.ok) throw new Error("freeze");
    const text = JSON.stringify(r.value.snapshot.content);
    expect(text).not.toMatch(/mensaje|evidencia|"m1"|"e1"|ownerId/i);
    expect(Object.keys(r.value.snapshot.content).sort()).toEqual(["alc", "operation", "rectifications", "selection", "warnings"]);
  });

  it("revisión del borrador distinta: STALE_DRAFT, sin crear nada", async () => {
    const { service, mem } = setup();
    const r = await service.freeze(freeze({ expectedDraftRevision: 2 }));
    expect(r).toMatchObject({ ok: false, error: { code: "STALE_DRAFT", stage: "congelado" } });
    expect(mem.activeCount(DOC)).toBe(0);
  });

  it("repetir el pedido es idempotente; la misma clave con otro contenido es conflicto", async () => {
    const { service, mem } = setup();
    const a = await service.freeze(freeze());
    const b = await service.freeze(freeze());
    expect(a.ok && b.ok && b.replayed).toBe(true);
    if (a.ok && b.ok) expect(b.value.revision.revisionId).toBe(a.value.revision.revisionId);
    expect(mem.activeCount(DOC)).toBe(1);
    expect(await service.freeze(freeze({ selection: ["intermediario", "comprador"] }))).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("mismo contenido y selección con otra clave: no crea otra revisión", async () => {
    const { service, mem } = setup();
    const a = await service.freeze(freeze());
    const b = await service.freeze(freeze({ idempotencyKey: "freeze-key-0002" }));
    if (!a.ok || !b.ok) throw new Error("freeze");
    expect(b.value.unchanged).toBe(true);
    expect(b.value.revision.revisionId).toBe(a.value.revision.revisionId);
    expect(mem.activeCount(DOC)).toBe(1);
  });

  it("cambia el contenido o la selección: revisión nueva que sustituye, invalida enlaces y no hereda respuestas", async () => {
    const { service, mem } = setup();
    const first = await service.freeze(freeze());
    if (!first.ok) throw new Error("freeze");
    await service.confirmAsAuthor(confirmCommand(first.value));
    mem.addInvitations(DOC, 2);

    mem.setDraft(DOC, draft({ draftRevision: 4, body: "Se entregan 11 cajas de ejemplo." }));
    const second = await service.freeze(freeze({ expectedDraftRevision: 4, idempotencyKey: "freeze-key-0003" }));
    if (!second.ok) throw new Error("freeze 2");
    expect(second.value.revision.supersedesRevisionId).toBe(first.value.revision.revisionId);
    expect(second.value.revision.confirmationStatus).toBe("pendiente");
    expect(mem.responsesOf(second.value.revision.revisionId)).toHaveLength(0);
    expect(mem.activeCount(DOC)).toBe(1);

    const third = await service.freeze(freeze({ expectedDraftRevision: 4, selection: ["intermediario", "comprador"], idempotencyKey: "freeze-key-0004" }));
    if (!third.ok) throw new Error("freeze 3");
    expect(third.value.revision.selection).toEqual(["autor", "intermediario", "comprador"]);
    expect(third.value.revision.supersedesRevisionId).toBe(second.value.revision.revisionId);
  });

  it("sin sesión, documento ajeno, entrada inválida y falla de base", async () => {
    expect(await setup(null).service.freeze(freeze())).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });
    expect(await setup(LUIS).service.freeze(freeze())).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    const { service, mem } = setup();
    expect(await service.freeze(freeze({ selection: ["escribano"] }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await service.freeze(freeze({ idempotencyKey: "corta" }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await service.freeze({ ...freeze(), extra: 1 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    mem.failNext();
    expect(await service.freeze(freeze())).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
  });
});

type Bundle = { revision: { revisionId: string; snapshotId: string; snapshotHash: string } };
const confirmCommand = (b: Bundle, over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  actor: "autor",
  documentId: DOC,
  revisionId: b.revision.revisionId,
  snapshotId: b.revision.snapshotId,
  snapshotHash: b.revision.snapshotHash,
  idempotencyKey: "confirm-key-0001",
  decision: "confirmar",
  checkboxChecked: true,
  ...over,
});

describe("MVP-071 · confirmación del autor", () => {
  it("el autor confirma pero el comprador es obligatorio: queda parcial", async () => {
    const { service } = setup();
    const f = await service.freeze(freeze({ selection: ["comprador"] }));
    if (!f.ok) throw new Error("freeze");
    const r = await service.confirmAsAuthor(confirmCommand(f.value));
    expect(r).toMatchObject({ ok: true, value: { confirmationStatus: "parcial", actor: { role: "autor", declaredName: null }, outcome: { decision: "confirmar" }, replayed: false } });
  });

  it("una revisión de otro documento no se confirma con la ruta equivocada", async () => {
    const { service } = setup();
    const f = await service.freeze(freeze({ selection: ["comprador"] }));
    if (!f.ok) throw new Error("freeze");
    expect(await service.confirmAsAuthor(confirmCommand(f.value, { documentId: "otro-documento" }))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await service.confirmAsAuthor(confirmCommand(f.value))).toMatchObject({ ok: true });
  });

  it("con un tercero seleccionado queda parcial: aun con una advertencia crítica", async () => {
    const { service } = setup();
    const f = await service.freeze(freeze());
    if (!f.ok) throw new Error("freeze");
    expect(f.value.snapshot.content.warnings[0].severity).toBe("critical");
    const r = await service.confirmAsAuthor(confirmCommand(f.value));
    expect(r).toMatchObject({ ok: true, value: { confirmationStatus: "parcial" } });
  });

  it("repetir con la misma clave devuelve lo persistido; otra clave: ya respondió", async () => {
    const { service, mem } = setup();
    const f = await service.freeze(freeze());
    if (!f.ok) throw new Error("freeze");
    const a = await service.confirmAsAuthor(confirmCommand(f.value));
    const b = await service.confirmAsAuthor(confirmCommand(f.value));
    expect(b).toMatchObject({ ok: true, replayed: true, value: { replayed: true } });
    if (a.ok && b.ok) expect(b.value.responseId).toBe(a.value.responseId);
    expect(await service.confirmAsAuthor(confirmCommand(f.value, { idempotencyKey: "confirm-key-0002" }))).toMatchObject({ ok: false, error: { code: "ALREADY_RESPONDED" } });
    expect(mem.responsesOf(f.value.revision.revisionId)).toHaveLength(1);
  });

  it("un hash equivocado, ajeno o de una revisión sustituida se rechaza antes de responder", async () => {
    const { service, mem } = setup();
    const f = await service.freeze(freeze());
    if (!f.ok) throw new Error("freeze");
    expect(await service.confirmAsAuthor(confirmCommand(f.value, { snapshotHash: "0".repeat(64) }))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    expect(await service.confirmAsAuthor(confirmCommand(f.value, { snapshotId: "otro-snapshot" }))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    expect(await setup(LUIS).service.confirmAsAuthor(confirmCommand(f.value))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });

    mem.setDraft(DOC, draft({ draftRevision: 4, body: "Texto cambiado." }));
    await service.freeze(freeze({ expectedDraftRevision: 4, idempotencyKey: "freeze-key-0009" }));
    expect(await service.confirmAsAuthor(confirmCommand(f.value, { idempotencyKey: "confirm-key-0009" }))).toMatchObject({ ok: false, error: { code: "REVISION_NOT_ACTIVE" } });
    expect(mem.responsesOf(f.value.revision.revisionId)).toHaveLength(0);
  });

  it("casilla sin marcar, rechazo o comando de tercero: entrada inválida", async () => {
    const { service } = setup();
    const f = await service.freeze(freeze());
    if (!f.ok) throw new Error("freeze");
    for (const over of [{ checkboxChecked: false }, { decision: "rechazar", checkboxChecked: false, rejectionRatified: true }, { actor: "tercero", token: "x", declaredName: "Ana" }]) {
      expect(await service.confirmAsAuthor(confirmCommand(f.value, over))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(await setup(null).service.confirmAsAuthor(confirmCommand(f.value))).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });
  });
});

describe("MVP-070/071 · handlers HTTP", () => {
  const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

  it("congela (201), repite (200) y marca el conflicto de borrador (409)", async () => {
    const { service } = setup();
    const handler = createFreezeHandler(async () => service);
    const body = { expectedDraftRevision: 3, selection: ["comprador"], idempotencyKey: "freeze-key-0001" };
    const a = await handler(post(body), DOC);
    expect(a.status).toBe(201);
    expect(a.headers.get("Cache-Control")).toContain("no-store");
    expect(Object.keys(await a.json()).sort()).toEqual(["revision", "snapshot", "unchanged"]);
    expect((await handler(post(body), DOC)).status).toBe(200);
    expect((await handler(post({ ...body, expectedDraftRevision: 1, idempotencyKey: "freeze-key-0002" }), DOC)).status).toBe(409);
  });

  it("el documento sale de la ruta y el actor es siempre el autor", async () => {
    const { service } = setup();
    const f = await service.freeze(freeze());
    if (!f.ok) throw new Error("freeze");
    const handler = createAuthorConfirmationHandler(async () => service);
    // El cliente intenta imponer otro documento y otro actor: la ruta manda.
    const rest = confirmCommand(f.value, { documentId: "otro", actor: "tercero" });
    const res = await handler(post(rest), DOC);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ confirmationStatus: "parcial", actor: { role: "autor" } });
    const again = await handler(post({ ...rest, snapshotHash: "1".repeat(64), idempotencyKey: "confirm-key-0005" }), DOC);
    expect(again.status).toBe(409);
  });

  it("cuerpo ilegible: entrada inválida (400)", async () => {
    const { service } = setup();
    const res = await createFreezeHandler(async () => service)(new Request("http://localhost/api", { method: "POST", body: "no json" }), DOC);
    expect(res.status).toBe(400);
  });
});

describe("F-1/F-2 · congelado con evaluación ALC", () => {
  it("el evaluador recibe el borrador y la selección v2; el color lo fija la evaluación, no el llamador", async () => {
    const alc = fakeAlc({ color: "rojo" });
    const { service } = setup(ANA, alc);
    const r = await service.freeze(freeze({ selection: ["intermediario", "comprador"] }));
    if (!r.ok) throw new Error("freeze");
    expect(alc.calls[0]).toMatchObject({ ownerId: ANA, documentId: DOC, draft: { revision: 3 }, selection: ["autor", "intermediario", "comprador"] });
    expect(r.value.snapshot.schemaVersion).toBe(2);
    expect(r.value.revision.controlStatus).toBe("contradiccion_critica");
    expect(r.value.snapshot.content).toMatchObject({ alc: { color: "rojo" }, rectifications: [] });
  });

  it("un campo controlStatus del llamador es entrada inválida", async () => {
    const { service, alc } = setup();
    expect(await service.freeze({ ...freeze(), controlStatus: "sin_evaluar" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(alc.calls).toHaveLength(0);
  });

  it("sin comprador no se evalúa ni se congela", async () => {
    const { service, mem, alc } = setup();
    expect(await service.freeze(freeze({ selection: [] }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(alc.calls).toHaveLength(0);
    expect(mem.activeCount(DOC)).toBe(0);
  });

  it("un fallo técnico de la evaluación no congela y no es un rojo", async () => {
    const alc = fakeAlc({ fail: { code: "ALC_READING_INCOMPLETE", stage: "congelado", retryable: true, correlationId: "c" } });
    const { service, mem } = setup(ANA, alc);
    expect(await service.freeze(freeze())).toMatchObject({ ok: false, error: { code: "ALC_READING_INCOMPLETE", retryable: true } });
    expect(mem.activeCount(DOC)).toBe(0);
  });

  it("las rectificaciones viajan al evaluador y cambian la huella del comando", async () => {
    const alc = fakeAlc();
    const { service } = setup(ANA, alc);
    const rect = { claimId: "c_1", previousValue: "10", correctedValue: "12", reason: "El remito corrige la cantidad" };
    const a = await service.freeze(freeze({ rectifications: [rect] }));
    expect(a.ok).toBe(true);
    expect(alc.calls[0].rectifications).toEqual([rect]);
    expect(await service.freeze(freeze())).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  });
});

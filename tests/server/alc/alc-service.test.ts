import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAlcFactsReader, claimId } from "@/lib/ai/alc/facts";
import { createGroqStructuredPort } from "@/lib/ai/groq/structured";
import { ALC_RULE, ALC_TECHNICAL, type AlcSource } from "@/lib/contracts/alc";
import { FrozenOperationV2Schema } from "@/lib/contracts/review";
import { buildInventory } from "@/lib/documents/alc/inventory";
import { applyRectifications } from "@/lib/documents/alc/rectify";
import { createAlcEvaluator, type AlcSaveInput, type AlcStore } from "@/lib/documents/alc/service";
import { createAlcStore } from "@/lib/documents/alc/supabase";

import { scriptedGroqClient } from "../doubles/groq";

// Datos ficticios; la IA es un doble guionado y no hay base ni red.
const OWNER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const EVD = "44444444-4444-4444-8444-444444444444";
const EXT = "55555555-5555-4555-8555-555555555555";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const body = "Se entregan 12 cajas de ejemplo.";
const draft = { revision: 3, title: "Acuerdo ficticio", body };
const reading = (messageText: string, extractionText: string) => ({
  messages: [{ id: MSG, content: messageText }],
  evidences: [{ evidenceId: EVD, sha256: sha("remito") }],
  extractions: [{ extractionId: EXT, evidenceId: EVD, text: extractionText, extractedAt: "2026-10-16T12:00:00Z" }],
});

function claimOutput(overrides: { chat?: string; remito?: string; coverage?: boolean } = {}) {
  const chat = overrides.chat ?? "Se entregan 12 cajas";
  const remito = overrides.remito ?? "Remito: 12 cajas";
  return {
    contentCoverageComplete: overrides.coverage ?? true,
    claims: [
      {
        subject: "cajas", field: "cantidad", value: "12", unit: "cajas", numeric: true, ambiguous: false,
        assertions: [
          { sourceId: `m_${MSG}`, quote: chat, value: chat.match(/\d+/)![0], unit: "cajas" },
          { sourceId: `x_${EXT}`, quote: remito, value: remito.match(/\d+/)![0], unit: "cajas" },
        ],
      },
    ],
  };
}

function setup(steps: unknown[], read = reading("Se entregan 12 cajas", "Remito: 12 cajas")) {
  const { client } = scriptedGroqClient(steps.map((value) => ({ kind: "ok", value })) as never);
  const groq = createGroqStructuredPort({
    readEnv: (name: string) => ({ GROQ_API_KEY: "clave-ficticia", GROQ_MODEL: "modelo-ficticio" } as Record<string, string>)[name],
    createClient: () => client,
    log: () => {},
  });
  const saved: AlcSaveInput[] = [];
  const store: AlcStore = {
    async save(input) {
      saved.push(input);
      return { status: "saved", evaluationId: "66666666-6666-4666-8666-666666666666" };
    },
  };
  const evaluator = createAlcEvaluator({ reader: { read: async () => read }, facts: createAlcFactsReader({ groq }), store });
  return { evaluator, saved };
}

const run = (evaluator: ReturnType<typeof setup>["evaluator"], extra: Record<string, unknown> = {}) =>
  evaluator.evaluate({ ownerId: OWNER, documentId: DOC, draft, selection: ["autor", "comprador"], correlationId: "corr-1", ...extra });

describe("inventario de fuentes (F-1)", () => {
  it("lista todo lo usado y no omite un original aceptado sin extracción", () => {
    const inv = buildInventory({
      messages: [{ id: MSG, content: "hola" }],
      evidences: [{ evidenceId: EVD, sha256: sha("a") }, { evidenceId: "77777777-7777-4777-8777-777777777777", sha256: sha("b") }],
      extractions: [{ extractionId: EXT, evidenceId: EVD, text: "texto", extractedAt: "2026-10-16T12:00:00Z" }],
    });
    expect(inv.inventory).toEqual({ messages: [MSG], evidences: [EVD, "77777777-7777-4777-8777-777777777777"], extractions: [EXT] });
    expect(inv.sources.map((s) => [s.id, s.reading])).toEqual([
      [`e_77777777-7777-4777-8777-777777777777`, "pendiente"],
      [`m_${MSG}`, "legible"],
      [`x_${EXT}`, "legible"],
    ]);
    expect(inv.backing[`x_${EXT}`]).toEqual({ kind: "evidencia", id: EVD });
  });

  it("una extracción vacía es ilegible y dos extracciones del mismo original cuentan una sola vez", () => {
    const inv = buildInventory({
      messages: [],
      evidences: [{ evidenceId: EVD, sha256: sha("a") }],
      extractions: [
        { extractionId: "88888888-8888-4888-8888-888888888888", evidenceId: EVD, text: "viejo", extractedAt: "2026-10-16T10:00:00Z" },
        { extractionId: EXT, evidenceId: EVD, text: "   ", extractedAt: "2026-10-16T12:00:00Z" },
      ],
    });
    expect(inv.sources).toHaveLength(1);
    expect(inv.sources[0]).toMatchObject({ id: `x_${EXT}`, reading: "ilegible", originalId: `e_${EVD}` });
    expect(inv.inventory.extractions).toHaveLength(2);
  });
});

describe("evaluación de servidor (F-1)", () => {
  it("fuentes coincidentes: verde, persistido con la huella del insumo y alias sin ids privados", async () => {
    const { evaluator, saved } = setup([claimOutput()]);
    const r = await run(evaluator);
    expect(r).toMatchObject({ ok: true, value: { color: "verde", evaluationId: "66666666-6666-4666-8666-666666666666" } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ color: "verde", rulesVersion: "galcoa.alc.v1", selection: ["autor", "comprador"] });
    expect(saved[0].inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved[0].inventory).toEqual({ messages: [MSG], evidences: [EVD], extractions: [EXT] });
    if (!r.ok) return;
    const shared = JSON.stringify(r.value.shared);
    expect(shared).not.toContain(MSG);
    expect(shared).not.toContain(EXT);
    expect(r.value.shared.findings.some((f) => f.ruleId === ALC_RULE.MATCHING)).toBe(true);
    expect(r.value.sourceAliases).toEqual([
      { alias: "ALC-1", kind: "mensaje", id: MSG },
      { alias: "ALC-2", kind: "evidencia", id: EVD },
    ]);
    // El resumen compartible cumple el contrato del snapshot v2.
    expect(() => FrozenOperationV2Schema.parse({ operation: { title: "t", body: "b", corrections: [] }, warnings: [], selection: r.value.selection, alc: r.value.shared, rectifications: [] })).not.toThrow();
  });

  it("solo el chat respalda el dato: amarillo (declarado)", async () => {
    const { evaluator } = setup([{ ...claimOutput(), claims: [{ ...claimOutput().claims[0], assertions: [claimOutput().claims[0].assertions[0]] }] }]);
    const r = await run(evaluator);
    expect(r).toMatchObject({ ok: true, value: { color: "amarillo" } });
    if (r.ok) expect(r.value.shared.claims[0].status).toBe("declarado");
  });

  it("una fuente contradice al borrador: rojo, y se conserva la contradicción", async () => {
    const { evaluator } = setup([claimOutput({ remito: "Remito: 10 cajas" })], reading("Se entregan 12 cajas", "Remito: 10 cajas"));
    const r = await run(evaluator);
    expect(r).toMatchObject({ ok: true, value: { color: "rojo" } });
    if (r.ok) expect(r.value.shared.claims[0].status).toBe("contradicho");
  });

  it("200/198 conserva el rojo y la contradicción al persistir, sin reclasificar como declarado", async () => {
    const facts = claimOutput({ chat: "Se entregan 200 cajas", remito: "Remito: 198 cajas" });
    facts.claims[0].value = "200";
    const { evaluator, saved } = setup([facts], reading("Se entregan 200 cajas", "Remito: 198 cajas"));
    const result = await run(evaluator, { draft: { ...draft, body: "Se entregan 200 cajas de ejemplo." } });
    expect(result).toMatchObject({ ok: true, value: { color: "rojo" } });
    expect(saved[0]).toMatchObject({ color: "rojo", result: { color: "rojo" } });
    expect(saved[0].shared.claims[0].status).toBe("contradicho");
    expect(saved[0].shared.findings).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: ALC_RULE.CONTRADICTION })]));
  });

  it("una cita inventada o un dato fuera del borrador es un fallo técnico, nunca un rojo", async () => {
    const forged = setup([claimOutput({ remito: "Remito: 12 cajas falsas" })]);
    expect(await run(forged.evaluator)).toMatchObject({ ok: false, error: { code: ALC_TECHNICAL.CITATION } });
    expect(forged.saved).toHaveLength(0);
    const out = claimOutput();
    out.claims[0].value = "99";
    const invented = setup([out]);
    expect(await run(invented.evaluator)).toMatchObject({ ok: false, error: { code: ALC_TECHNICAL.CLAIM } });
    expect(invented.saved).toHaveLength(0);
  });

  it("un original aceptado sin extracción es lectura incompleta (técnico), no un rojo", async () => {
    const { evaluator, saved } = setup([{ ...claimOutput(), claims: [{ ...claimOutput().claims[0], assertions: [claimOutput().claims[0].assertions[0]] }] }], { ...reading("Se entregan 12 cajas", ""), extractions: [] });
    expect(await run(evaluator)).toMatchObject({ ok: false, error: { code: ALC_TECHNICAL.READING, retryable: true } });
    expect(saved).toHaveLength(0);
  });

  it("cobertura incompleta del borrador (un número sin afirmación) es rojo por ambigüedad", async () => {
    const { evaluator } = setup([claimOutput()]);
    const r = await evaluator.evaluate({ ownerId: OWNER, documentId: DOC, draft: { ...draft, body: `${body} Precio 500 pesos.` }, selection: ["autor", "comprador"] });
    expect(r).toMatchObject({ ok: true, value: { color: "rojo" } });
    if (r.ok) expect(r.value.shared.findings.some((f) => f.ruleId === ALC_RULE.AMBIGUITY)).toBe(true);
  });

  it("una selección fuera del contrato nuevo es rojo por participantes", async () => {
    const { evaluator } = setup([claimOutput()]);
    const r = await run(evaluator, { selection: ["autor"] });
    expect(r).toMatchObject({ ok: true, value: { color: "rojo" } });
  });

  it("estados de la base: borrador cambiado, inventario cambiado y resultado incoherente", async () => {
    for (const [status, code] of [["stale_draft", "STALE_DRAFT"], ["inventory_mismatch", ALC_TECHNICAL.INVENTORY], ["result_inconsistent", "ALC_RESULT_INCONSISTENT"], ["not_available", "NOT_AVAILABLE"]] as const) {
      const { client } = scriptedGroqClient([{ kind: "ok", value: claimOutput() }] as never);
      const groq = createGroqStructuredPort({ readEnv: (name: string) => ({ GROQ_API_KEY: "k", GROQ_MODEL: "m" } as Record<string, string>)[name], createClient: () => client, log: () => {} });
      const evaluator = createAlcEvaluator({
        reader: { read: async () => reading("Se entregan 12 cajas", "Remito: 12 cajas") },
        facts: createAlcFactsReader({ groq }),
        store: { save: async () => ({ status }) },
      });
      expect(await run(evaluator)).toMatchObject({ ok: false, error: { code } });
    }
  });

  it("el identificador de la afirmación depende solo de sujeto y campo", () => {
    expect(claimId("cajas", "cantidad")).toBe(claimId(" cajas ", "cantidad"));
    expect(claimId("cajas", "precio")).not.toBe(claimId("cajas", "cantidad"));
  });
});

describe("rectificación trazable (F-4)", () => {
  const source = (id: string, kind: AlcSource["kind"], text: string): AlcSource => ({ id, originalId: id, kind, hash: sha(id), reading: "legible", text });
  const sources = [source("m_1", "mensaje", "Vendi 10 cajas"), source("x_1", "evidencia", "Remito 12 cajas")];
  const claim = {
    id: "c_1", subject: "cajas", field: "cantidad", value: "12", unit: "cajas", numeric: true, ambiguous: false,
    assertions: [
      { citation: { sourceId: "m_1", start: 6, end: 8, quote: "10" }, value: "10", unit: "cajas" },
      { citation: { sourceId: "x_1", start: 7, end: 9, quote: "12" }, value: "12", unit: "cajas" },
    ],
  };
  const request = { claimId: "c_1", previousValue: "10", correctedValue: "12", reason: "Error de tipeo" };

  it("con respaldo probatorio reemplaza la afirmación previa y conserva el registro original", () => {
    const out = applyRectifications([claim], [request], sources);
    expect(out.claims[0].assertions.map((a) => a.citation.sourceId)).toEqual(["x_1"]);
    expect(out.applied).toEqual([{ ...request, originalSourceIds: ["m_1"], correctedSourceIds: ["x_1"] }]);
  });

  it("sin motivo, sin respaldo probatorio o con otro valor no se aplica: la contradicción sigue", () => {
    expect(applyRectifications([claim], [{ ...request, reason: "  " }], sources).applied).toEqual([]);
    expect(applyRectifications([claim], [{ ...request, correctedValue: "11" }], sources).applied).toEqual([]);
    const sinRemito = { ...claim, assertions: [claim.assertions[0]] };
    const out = applyRectifications([sinRemito], [request], sources);
    expect(out.applied).toEqual([]);
    expect(out.claims[0].assertions).toHaveLength(1);
  });

  it("nunca borra una afirmación probatoria", () => {
    const out = applyRectifications([claim], [{ ...request, previousValue: "12" }], sources);
    expect(out.applied).toEqual([]);
    expect(out.claims[0].assertions).toHaveLength(2);
  });
});

describe("adaptador del ejecutor", () => {
  const input: AlcSaveInput = {
    ownerId: OWNER, documentId: DOC, draftRevision: 3, selection: ["autor", "comprador"], rulesVersion: "galcoa.alc.v1",
    input: { a: 1 }, inputHash: "a".repeat(64), color: "verde", result: { findings: [] },
    shared: { rulesVersion: "galcoa.alc.v1", color: "verde", inputHash: "a".repeat(64), findings: [], claims: [] },
    rectifications: [], sourceAliases: [], inventory: { messages: [], evidences: [], extractions: [] }, correlationId: "corr-1",
  };

  it("llama a save_alc_evaluation con el actor verificado y jsonb serializado", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const store = createAlcStore({
      verifiedUserId: OWNER,
      executor: { rpc: async (name, args) => (calls.push({ name, args: args! }), { data: { status: "saved", evaluationId: "66666666-6666-4666-8666-666666666666" }, error: null }) },
    });
    expect(await store.save(input)).toEqual({ status: "saved", evaluationId: "66666666-6666-4666-8666-666666666666" });
    expect(calls[0].name).toBe("save_alc_evaluation");
    expect(calls[0].args.p_actor_id).toBe(OWNER);
    expect(typeof calls[0].args.p_input).toBe("string");
    expect(Object.keys(calls[0].args)).toHaveLength(14);
  });

  it("un actor ajeno o un error de SQL no cruzan la frontera", async () => {
    const executor = { rpc: async () => ({ data: null, error: { code: "42501" } }) };
    await expect(createAlcStore({ verifiedUserId: OWNER, executor }).save(input)).rejects.toThrow("Persistencia de evaluación no disponible");
    await expect(createAlcStore({ verifiedUserId: "otro", executor }).save(input)).rejects.toThrow("Operación no autorizada");
    const bad = { rpc: async () => ({ data: { status: "saved", evaluationId: "no-uuid" }, error: null }) };
    await expect(createAlcStore({ verifiedUserId: OWNER, executor: bad }).save(input)).rejects.toThrow();
  });
});

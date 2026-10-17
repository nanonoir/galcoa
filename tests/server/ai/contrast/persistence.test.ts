import { describe, expect, it, vi } from "vitest";

import { ContrastPersistenceError, createContrastStore } from "@/lib/documents/contrast/persistence";
import type { SaveReportInput } from "@/lib/documents/contrast/ports";
import { contrastRpcCommands } from "@/lib/documents/contrast/rpc-commands";

// Datos ficticios; RPC doblada, sin base ni proveedores.
const ACTOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const DOC = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";
const MSG = "44444444-4444-4444-8444-444444444444";
const EXT = "55555555-5555-4555-8555-555555555555";
const REPORT = "66666666-6666-4666-8666-666666666666";
const CREATED = "2026-10-16T16:00:00.123456Z";
const SECRET = "postgres://galcoa_exec_login:secreto@host/db";

const input = (over: Partial<SaveReportInput> = {}): SaveReportInput => ({
  ownerId: ACTOR, documentId: DOC, draftId: DRAFT, draftRevision: 3,
  draftContent: { title: "T", body: "B", corrections: ["c"] }, correlationId: "corr-1",
  result: "con_advertencias",
  findings: [{ message: "Fecha no informada", severity: "warning", sourceRefs: ["m1", "b1"] }],
  inputs: [
    { ref: "m1", kind: "mensaje", id: MSG },
    { ref: "e1", kind: "extraccion", id: EXT },
    { ref: "b1", kind: "borrador", id: DRAFT },
  ],
  modelId: "openai/gpt-oss-120b", promptVersion: "contrast-v1", limitations: ["Contraste textual"], ...over,
});

function setup(data: unknown = { status: "created", reportId: REPORT, createdAt: CREATED }, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const readDraft = vi.fn().mockResolvedValue(null);
  const store = createContrastStore({ verifiedUserId: ACTOR, executor: { rpc }, readDraft });
  return { rpc, readDraft, store };
}

describe("adaptador SQL del contraste (RPC doblada)", () => {
  it("envía exactamente los argumentos de la allowlist, con jsonb ya serializado y sin releer el borrador", async () => {
    const { rpc, readDraft, store } = setup();
    const i = input();
    expect(await store.saveReport(i)).toEqual({ status: "created", reportId: REPORT, createdAt: CREATED });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("persist_contrast_report");
    expect(Object.keys(args)).toEqual([...contrastRpcCommands.persist_contrast_report]);
    expect(args).toEqual({
      p_actor_id: ACTOR, p_document_id: DOC, p_draft_id: DRAFT, p_draft_revision: 3,
      p_draft_content: JSON.stringify(i.draftContent), p_result: "con_advertencias",
      p_findings: JSON.stringify(i.findings), p_inputs: JSON.stringify(i.inputs),
      p_model_id: "openai/gpt-oss-120b", p_prompt_version: "contrast-v1",
      p_limitations: JSON.stringify(i.limitations), p_correlation_id: "corr-1",
    });
    expect(readDraft).not.toHaveBeenCalled();
  });

  it.each(["stale_draft", "not_available"] as const)("mapea %s sin éxito", async (status) => {
    expect(await setup({ status }).store.saveReport(input())).toEqual({ status });
  });

  it("actor distinto del verificado falla antes de cualquier E/S", async () => {
    const { rpc, readDraft, store } = setup();
    await expect(store.saveReport(input({ ownerId: OTHER }))).rejects.toMatchObject({ code: "NO_SESSION" });
    await expect(store.getCurrentDraft(OTHER, DOC)).rejects.toMatchObject({ code: "NO_SESSION" });
    expect(rpc).not.toHaveBeenCalled();
    expect(readDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["clave extra", { extra: 1 } as never],
    ["documento no uuid", { documentId: "doc-1" }],
    ["sin b1", { inputs: [{ ref: "m1", kind: "mensaje" as const, id: MSG }] }],
    ["b1 con otro draftId", { inputs: [{ ref: "b1", kind: "borrador" as const, id: MSG }] }],
    ["ref con tipo incoherente", { inputs: [{ ref: "m1", kind: "extraccion" as const, id: MSG }, { ref: "b1", kind: "borrador" as const, id: DRAFT }] }],
    ["hallazgo con ref no enviada", { findings: [{ message: "x", severity: "warning" as const, sourceRefs: ["m9"] }] }],
    ["revisión 0", { draftRevision: 0 }],
    ["correlación vacía", { correlationId: "" }],
  ])("forma inválida (%s): INVALID_INPUT sin llamar a la RPC", async (_, over) => {
    const { rpc, store } = setup();
    await expect(store.saveReport(input(over))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["created sin createdAt", { status: "created", reportId: REPORT }],
    ["created con reportId inválido", { status: "created", reportId: "r1", createdAt: CREATED }],
    ["clave extra", { status: "stale_draft", detail: "x" }],
    ["estado desconocido", { status: "ok" }],
    ["null", null],
  ])("respuesta inválida (%s): INVALID_RESPONSE", async (_, data) => {
    await expect(setup(data).store.saveReport(input())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("errores del ejecutor y excepciones son opacos y no filtran secretos", async () => {
    for (const [expected, make] of [
      ["NO_SESSION", () => setup(null, { code: "42501", message: SECRET })],
      ["INVALID_INPUT", () => setup(null, { code: "22023", message: SECRET })],
      ["UNAVAILABLE", () => setup(null, { code: "XX000", message: SECRET })],
    ] as const) {
      const error = await make().store.saveReport(input()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ContrastPersistenceError);
      expect(error).toMatchObject({ code: expected });
      expect(JSON.stringify({ m: (error as Error).message, s: (error as Error).stack?.split("\n")[0] })).not.toContain("secreto");
    }
    const rpc = vi.fn().mockRejectedValue(new Error(SECRET));
    const store = createContrastStore({ verifiedUserId: ACTOR, executor: { rpc }, readDraft: vi.fn() });
    const error = await store.saveReport(input()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "UNAVAILABLE" });
    expect((error as Error).message).not.toContain("secreto");
  });

  it("getCurrentDraft delega en el lector inyectado y rechaza un borrador de otro documento", async () => {
    const draft = { draftId: DRAFT, documentId: DOC, draftRevision: 3, content: { title: "T", body: "B", corrections: [] }, updatedAt: CREATED };
    const { readDraft, store } = setup();
    readDraft.mockResolvedValueOnce(draft);
    expect(await store.getCurrentDraft(ACTOR, DOC)).toEqual(draft);
    expect(readDraft).toHaveBeenCalledWith(ACTOR, DOC);
    readDraft.mockResolvedValueOnce({ ...draft, documentId: OTHER });
    await expect(store.getCurrentDraft(ACTOR, DOC)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    readDraft.mockRejectedValueOnce(new Error(SECRET));
    await expect(store.getCurrentDraft(ACTOR, DOC)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});

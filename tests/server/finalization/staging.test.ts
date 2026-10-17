import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createPdfStagingService, createSupabasePdfStagingStore, type PdfStagingStore, type RenderInputResult } from "@/lib/documents/finalization/staging";
import { renderFinalPdf } from "@/lib/documents/pdf/render";

// Datos ficticios.
const USER = "11111111-1111-4111-8111-111111111111";
const OP = "44444444-4444-4444-8444-444444444444";
const REV = "33333333-3333-4333-8333-333333333333";

const ready = (staged: { sha256: string; byteLength: number } | null = null): Extract<RenderInputResult, { status: "ready" }> => ({
  status: "ready", operationId: OP, revisionId: REV, phase: "reserved", renderer: "react-pdf-v1", publicReference: "ref-ficticia-0001",
  snapshotHash: "a".repeat(64), claimedAt: "2026-10-17T10:00:00.000Z",
  content: { operation: { title: "Acuerdo ficticio", body: "Se entregan 12 cajas.\nSegundo párrafo con ñ y tildes.", corrections: [] }, warnings: [], selection: ["autor"] },
  receipts: [{ responseId: "55555555-5555-4555-8555-555555555555", role: "autor", decision: "confirmar", declaredName: null, respondedAt: "2026-10-17T09:59:00.000Z" }],
  staged,
});

/** Doble con la semántica de la RPC: un único staging por operación, mismo fencing. */
function fakeStore(fencing = 3) {
  let staged: { bytes: Uint8Array; sha256: string; byteLength: number } | null = null;
  const store: PdfStagingStore = {
    async renderInput(i) {
      if (i.fencing !== fencing) return { status: "stale_fencing" };
      return ready(staged && { sha256: staged.sha256, byteLength: staged.byteLength });
    },
    async stage(i) {
      if (i.fencing !== fencing) return { status: "stale_fencing" };
      const sha256 = createHash("sha256").update(i.bytes).digest("hex");
      if (staged) return { status: staged.sha256 === sha256 ? "already_staged" : "conflict", sha256: staged.sha256, byteLength: staged.byteLength };
      staged = { bytes: i.bytes, sha256, byteLength: i.bytes.byteLength };
      return { status: "staged", sha256, byteLength: i.bytes.byteLength };
    },
  };
  return { store, staged: () => staged };
}

describe("MVP-081 · staging canónico del PDF", () => {
  it("el render es determinista para la misma entrada", async () => {
    const input = ready();
    const pdf = { content: input.content, receipts: [{ responseId: input.receipts[0].responseId, role: "autor" as const, declaredName: null, respondedAt: input.receipts[0].respondedAt }], revisionId: REV, snapshotHash: input.snapshotHash, publicReference: input.publicReference, finalizedAt: input.claimedAt };
    const a = await renderFinalPdf(pdf);
    const b = await renderFinalPdf(pdf);
    expect(a.sha256).toBe(b.sha256);
    expect(Buffer.from(a.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("renderiza y guarda una vez; el reintento con el mismo fencing reutiliza los bytes sin renderizar", async () => {
    const { store, staged } = fakeStore();
    const render = vi.fn(renderFinalPdf);
    const service = createPdfStagingService({ store, render });
    const first = await service.stagePdf({ operationId: OP, fencing: 3 });
    expect(first.ok && first.value.reused).toBe(false);
    const second = await service.stagePdf({ operationId: OP, fencing: 3 });
    expect(second).toEqual({ ok: true, value: { sha256: staged()!.sha256, byteLength: staged()!.byteLength, reused: true } });
    expect(render).toHaveBeenCalledTimes(1);
    expect(first.ok && first.value.sha256).toBe(staged()!.sha256);
  });

  it("un fencing viejo se rechaza antes de renderizar", async () => {
    const { store, staged } = fakeStore(3);
    const render = vi.fn(renderFinalPdf);
    const result = await createPdfStagingService({ store, render }).stagePdf({ operationId: OP, fencing: 2 });
    expect(result).toMatchObject({ ok: false, error: { code: "STALE_CLAIM", retryable: false } });
    expect(render).not.toHaveBeenCalled();
    expect(staged()).toBeNull();
  });

  it("un fallo del renderer es un impedimento técnico reintentable y no guarda nada", async () => {
    const { store, staged } = fakeStore();
    const result = await createPdfStagingService({ store, render: async () => { throw new Error("boom con detalle interno"); } }).stagePdf({ operationId: OP, fencing: 3 });
    expect(result).toMatchObject({ ok: false, error: { code: "RENDER_FAILED", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("boom");
    expect(staged()).toBeNull();
  });

  it("bytes distintos de los ya guardados son un conflicto técnico, no una sobrescritura", async () => {
    const { store, staged } = fakeStore();
    const service = createPdfStagingService({ store: { ...store, renderInput: async () => ready() } });
    expect((await service.stagePdf({ operationId: OP, fencing: 3 })).ok).toBe(true);
    const before = staged()!.sha256;
    const other = createPdfStagingService({
      store: { ...store, renderInput: async () => ready() },
      render: async () => ({ bytes: new Uint8Array([1, 2, 3]), sha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"), byteLength: 3, renderer: "x" }),
    });
    expect(await other.stagePdf({ operationId: OP, fencing: 3 })).toMatchObject({ ok: false, error: { code: "ARTIFACT_CONFLICT" } });
    expect(staged()!.sha256).toBe(before);
  });

  it("si el hash devuelto no coincide con los bytes enviados, falla", async () => {
    const { store } = fakeStore();
    const lying: PdfStagingStore = { ...store, stage: async () => ({ status: "staged", sha256: "b".repeat(64), byteLength: 10 }) };
    expect(await createPdfStagingService({ store: lying }).stagePdf({ operationId: OP, fencing: 3 })).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE" } });
  });

  it("entradas inválidas se rechazan sin E/S", async () => {
    const renderInput = vi.fn();
    const service = createPdfStagingService({ store: { renderInput, stage: vi.fn() } });
    for (const bad of [{ operationId: "x", fencing: 1 }, { operationId: OP, fencing: 0 }, { operationId: OP, fencing: 1.5 }]) {
      expect(await service.stagePdf(bad)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(renderInput).not.toHaveBeenCalled();
  });
});

describe("MVP-081 · adaptador de las RPC del ejecutor", () => {
  const rpcWith = (data: unknown, error: unknown = null) => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    return { calls, rpc: { rpc: async (name: string, args?: Record<string, unknown>) => { calls.push({ name, args: args ?? {} }); return { data, error }; } } };
  };

  it("liga el actor verificado y envía los bytes como Buffer", async () => {
    const { calls, rpc } = rpcWith({ status: "staged", sha256: "c".repeat(64), byteLength: 3 });
    const store = createSupabasePdfStagingStore({ verifiedUserId: USER, executor: rpc });
    await store.stage({ operationId: OP, fencing: 2, bytes: new Uint8Array([1, 2, 3]), correlationId: "corr" });
    expect(calls[0].name).toBe("stage_finalization_pdf");
    expect(calls[0].args).toMatchObject({ p_actor_id: USER, p_operation_id: OP, p_fencing: 2, p_correlation_id: "corr" });
    expect(Buffer.isBuffer(calls[0].args.p_content)).toBe(true);
  });

  it("no filtra errores del proveedor ni acepta respuestas con forma inesperada", async () => {
    const failing = createSupabasePdfStagingStore({ verifiedUserId: USER, executor: rpcWith(null, { message: "select secret from x" }).rpc });
    await expect(failing.renderInput({ operationId: OP, fencing: 1 })).rejects.toThrow("Persistencia no disponible");
    const odd = createSupabasePdfStagingStore({ verifiedUserId: USER, executor: rpcWith({ status: "staged", sha256: "bad", byteLength: 1, extra: 1 }).rpc });
    await expect(odd.stage({ operationId: OP, fencing: 1, bytes: new Uint8Array([1]), correlationId: "c" })).rejects.toThrow("Respuesta de persistencia inválida");
    const anon = createSupabasePdfStagingStore({ verifiedUserId: "", executor: rpcWith({}).rpc });
    await expect(anon.renderInput({ operationId: OP, fencing: 1 })).rejects.toThrow("Operación no autorizada");
  });

  it("un error de la base se convierte en TECHNICAL_FAILURE reintentable", async () => {
    const store = createSupabasePdfStagingStore({ verifiedUserId: USER, executor: rpcWith(null, { code: "EXECUTOR_UNAVAILABLE" }).rpc });
    expect(await createPdfStagingService({ store }).stagePdf({ operationId: OP, fencing: 1 })).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
  });
});

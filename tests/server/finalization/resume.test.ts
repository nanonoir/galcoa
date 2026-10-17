import { describe, expect, it, vi } from "vitest";

import { createFinalizationAdvancer } from "@/lib/documents/finalization/resume";

const OP = "44444444-4444-4444-8444-444444444444";
const staged = { ok: true as const, value: { sha256: "a".repeat(64), byteLength: 10, reused: false } };
const prepared = { ok: true as const, value: { privateDetailHash: "b".repeat(64), manifestHash: "c".repeat(64), envelope: {} as never, reused: false } };
const error = { code: "RECEIPTS_INCOMPLETE", stage: "persistencia" as const, retryable: false, correlationId: "c" };

function deps() {
  return { stagePdf: vi.fn(async () => staged), prepareManifest: vi.fn(async () => prepared) };
}
const advancer = (d: ReturnType<typeof deps>) => createFinalizationAdvancer({ staging: { stagePdf: d.stagePdf }, manifest: { prepareManifest: d.prepareManifest } });

describe("avance de fases", () => {
  it("desde reserved guarda el PDF y luego el manifiesto con el fencing recibido", async () => {
    const d = deps();
    expect(await advancer(d).advance({ operationId: OP, fencing: 4, phase: "reserved" })).toEqual({ ok: true, phase: "manifest_ready" });
    expect(d.stagePdf).toHaveBeenCalledWith({ operationId: OP, fencing: 4 });
    expect(d.prepareManifest).toHaveBeenCalledWith({ operationId: OP, fencing: 4 });
  });

  it("un fallo de staging corta el avance sin tocar el manifiesto", async () => {
    const d = deps();
    d.stagePdf.mockResolvedValueOnce({ ok: false, error } as never);
    expect(await advancer(d).advance({ operationId: OP, fencing: 1, phase: "reserved" })).toEqual({ ok: false, error });
    expect(d.prepareManifest).not.toHaveBeenCalled();
  });

  it("desde pdf_staged no vuelve a renderizar y un fallo del manifiesto se propaga", async () => {
    const d = deps();
    d.prepareManifest.mockResolvedValueOnce({ ok: false, error } as never);
    expect(await advancer(d).advance({ operationId: OP, fencing: 1, phase: "pdf_staged" })).toEqual({ ok: false, error });
    expect(d.stagePdf).not.toHaveBeenCalled();
  });

  it("desde manifest_ready no repite ninguna fase", async () => {
    const d = deps();
    expect(await advancer(d).advance({ operationId: OP, fencing: 1, phase: "manifest_ready" })).toEqual({ ok: true, phase: "manifest_ready" });
    expect(d.stagePdf).not.toHaveBeenCalled();
    expect(d.prepareManifest).not.toHaveBeenCalled();
  });
});

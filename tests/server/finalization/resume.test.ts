import { describe, expect, it, vi } from "vitest";

import { createFinalizationAdvancer } from "@/lib/documents/finalization/resume";

const OP = "44444444-4444-4444-8444-444444444444";
const ok = { ok: true as const, value: { sha256: "a".repeat(64), byteLength: 10, reused: false } };

describe("avance de fases", () => {
  it("desde reserved guarda el PDF con el fencing recibido y queda en pdf_staged", async () => {
    const stagePdf = vi.fn(async () => ok);
    expect(await createFinalizationAdvancer({ staging: { stagePdf } }).advance({ operationId: OP, fencing: 4, phase: "reserved" })).toEqual({ ok: true, phase: "pdf_staged" });
    expect(stagePdf).toHaveBeenCalledWith({ operationId: OP, fencing: 4 });
  });

  it("un fallo de staging corta el avance y se propaga sin cambiar de fase", async () => {
    const error = { code: "RECEIPTS_INCOMPLETE", stage: "persistencia" as const, retryable: false, correlationId: "c" };
    const stagePdf = vi.fn(async () => ({ ok: false as const, error }));
    expect(await createFinalizationAdvancer({ staging: { stagePdf } }).advance({ operationId: OP, fencing: 1, phase: "reserved" })).toEqual({ ok: false, error });
  });

  it("una fase posterior no vuelve a renderizar ni a guardar", async () => {
    const stagePdf = vi.fn(async () => ok);
    expect(await createFinalizationAdvancer({ staging: { stagePdf } }).advance({ operationId: OP, fencing: 1, phase: "pdf_staged" })).toEqual({ ok: true, phase: "pdf_staged" });
    expect(stagePdf).not.toHaveBeenCalled();
  });
});

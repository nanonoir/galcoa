import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
import type { ParticipantSelection } from "@/lib/contracts/review";
import { applyTransition, canClaim, type FinalizationOperation } from "@/lib/documents/finalization/phases";
import { buildReceipts, receiptsHeadline, ReceiptsError } from "@/lib/documents/finalization/receipts";
import { RENDERER_VERSION, renderFinalPdf } from "@/lib/documents/pdf/render";

// Datos ficticios.
const SNAP = "736a8da7c6c9257c313c1580dbc42dc88c17b3db4de868a24f41d255fbefe804";
const CONTENT = {
  operation: {
    body: "Se entregan 12 cajas de ejemplo el 2026-10-01.\nPrecio no informado.",
    corrections: ["Ortografía: «entregan»"],
    title: "Acuerdo ficticio de entrega",
  },
  selection: ["autor", "comprador"] as ParticipantSelection,
  warnings: [
    {
      id: "w-1",
      message: "Chat indica 10 cajas; remito indica 12.",
      severity: "critical" as const,
      sources: [
        { alias: "Fuente A", description: "chat: 10 cajas" },
        { alias: "Fuente B", description: "remito aportado: 12 cajas" },
      ],
    },
  ],
};
const RESPONSES = [
  { responseId: "c-3", role: "comprador" as const, decision: "confirmar" as const, declaredName: "Juan Pérez", respondedAt: "2026-10-16T12:02:00.000Z" },
  { responseId: "c-1", role: "autor" as const, decision: "confirmar" as const, declaredName: null, respondedAt: "2026-10-16T12:00:00.000Z" },
];

/** Texto de los flujos del PDF (inflados), para buscar frases. */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    try {
      out.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch {
      out.push(m[1]);
    }
  }
  // react-pdf escribe cada línea como un arreglo TJ de fragmentos hex (WinAnsi) con ajustes de kerning entre medio.
  const lines: string[] = [];
  for (const m of out.join("\n").matchAll(/\[(.*?)\]\s*TJ/g)) {
    lines.push([...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join(""));
  }
  return lines.join("\n");
}

describe("MVP-080 · elegibilidad del claim", () => {
  const base = { revisionActive: true, snapshotHash: SNAP, selection: ["autor", "comprador"] as ParticipantSelection, alcEvaluation: { color: "verde" as const, current: true } };
  const r = (role: "autor" | "comprador", decision: "confirmar" | "rechazar" = "confirmar", snapshotHash = SNAP) => ({ role, decision, snapshotHash });

  it("todas las confirmaciones del mismo snapshot: se puede reclamar", () => {
    expect(canClaim({ ...base, responses: [r("autor"), r("comprador")] })).toEqual({ ok: true });
  });

  it.each([
    ["falta una confirmación", { responses: [r("autor")] }, "CONFIRMATIONS_MISSING"],
    ["un rechazo", { responses: [r("autor"), r("comprador", "rechazar")] }, "CONFIRMATION_REJECTED"],
    ["respuesta de otro snapshot", { responses: [r("autor"), r("comprador", "confirmar", "0".repeat(64))] }, "SNAPSHOT_MISMATCH"],
    ["revisión no activa", { revisionActive: false, responses: [r("autor"), r("comprador")] }, "REVISION_NOT_ACTIVE"],
  ])("%s → %s", (_, over, code) => {
    expect(canClaim({ ...base, ...over })).toEqual({ ok: false, code });
  });
});

describe("F-1 - veredicto ALC en el claim", () => {
  const base = { revisionActive: true, snapshotHash: SNAP, selection: ["autor", "comprador"] as ParticipantSelection };
  const responses = [
    { role: "autor" as const, decision: "confirmar" as const, snapshotHash: SNAP },
    { role: "comprador" as const, decision: "confirmar" as const, snapshotHash: SNAP },
  ];
  it.each([
    ["sin evaluación", null, "evaluation_required"],
    ["evaluación vencida", { color: "verde" as const, current: false }, "stale_evaluation"],
    ["rojo, aunque todos confirmaron", { color: "rojo" as const, current: true }, "red"],
  ])("bloquea: %s", (_, alcEvaluation, reason) => {
    expect(canClaim({ ...base, responses, alcEvaluation })).toEqual({ ok: false, code: "ALC_BLOCKED", reason });
  });
  it("amarillo vigente no bloquea", () => {
    expect(canClaim({ ...base, responses, alcEvaluation: { color: "amarillo", current: true } })).toEqual({ ok: true });
  });
  it("selección sin comprador (nueva escritura) bloquea", () => {
    expect(canClaim({ ...base, selection: ["autor"], responses: [responses[0]], alcEvaluation: { color: "verde", current: true } })).toEqual({
      ok: false, code: "ALC_BLOCKED", reason: "selection_invalid",
    });
  });
});

describe("MVP-080 · fases, lease y fencing", () => {
  const now = "2026-10-16T12:00:00.000Z";
  const later = "2026-10-16T12:10:00.000Z";
  const op: FinalizationOperation = { phase: "reserved", status: "active", fencing: 1, leaseExpiresAt: "2026-10-16T12:05:00.000Z" };

  it("avanza de a una fase con fencing vigente; repetir la misma fase es idempotente", () => {
    const a = applyTransition(op, { type: "advance", to: "pdf_staged", fencing: 1, now });
    expect(a).toMatchObject({ ok: true, op: { phase: "pdf_staged" } });
    expect(applyTransition(op, { type: "advance", to: "reserved", fencing: 1, now })).toEqual({ ok: true, op });
  });

  it.each([
    ["saltar una fase", { type: "advance", to: "manifest_ready", fencing: 1, now }, "PHASE_SKIP"],
    ["fencing viejo", { type: "advance", to: "pdf_staged", fencing: 0, now }, "STALE_FENCING"],
    ["lease vencido", { type: "advance", to: "pdf_staged", fencing: 1, now: later }, "LEASE_EXPIRED"],
    ["tomar con lease vigente", { type: "takeover", now, leaseSeconds: 60 }, "LEASE_ACTIVE"],
  ] as const)("rechaza %s", (_, t, error) => {
    expect(applyTransition(op, t)).toEqual({ ok: false, error });
  });

  it("retroceder de fase no está permitido y publicada es terminal", () => {
    expect(applyTransition({ ...op, phase: "manifest_ready" }, { type: "advance", to: "pdf_staged", fencing: 1, now })).toEqual({
      ok: false,
      error: "PHASE_BACKWARDS",
    });
    expect(applyTransition({ ...op, phase: "published" }, { type: "abandon", fencing: 1 })).toEqual({ ok: false, error: "OPERATION_PUBLISHED" });
  });

  it("lease vencido: otro toma con fencing nuevo y el worker viejo ya no escribe", () => {
    const taken = applyTransition(op, { type: "takeover", now: later, leaseSeconds: 120 });
    if (!taken.ok) throw new Error("takeover");
    expect(taken.op).toMatchObject({ fencing: 2, phase: "reserved", status: "active" });
    expect(applyTransition(taken.op, { type: "advance", to: "pdf_staged", fencing: 1, now: later })).toEqual({ ok: false, error: "STALE_FENCING" });
    expect(applyTransition(taken.op, { type: "advance", to: "pdf_staged", fencing: 2, now: later }).ok).toBe(true);
  });

  it("abandono: invalida escrituras tardías y reanudar exige fencing nuevo", () => {
    const abandoned = applyTransition(op, { type: "abandon", fencing: 1 });
    if (!abandoned.ok) throw new Error("abandon");
    expect(applyTransition(abandoned.op, { type: "advance", to: "pdf_staged", fencing: 1, now })).toEqual({ ok: false, error: "OPERATION_ABANDONED" });
    const resumed = applyTransition(abandoned.op, { type: "takeover", now, leaseSeconds: 60 });
    expect(resumed).toMatchObject({ ok: true, op: { status: "active", fencing: 2 } });
  });

  it("renovar: solo el dueño vigente", () => {
    expect(applyTransition(op, { type: "renew", fencing: 1, now, leaseSeconds: 60 })).toMatchObject({ ok: true, op: { leaseExpiresAt: "2026-10-16T12:01:00.000Z" } });
    expect(applyTransition(op, { type: "renew", fencing: 9, now, leaseSeconds: 60 })).toEqual({ ok: false, error: "STALE_FENCING" });
  });
});

describe("MVP-081 · constancias", () => {
  it("orden estable autor → comprador, autor sin nombre declarado", () => {
    const receipts = buildReceipts(CONTENT.selection, RESPONSES);
    expect(receipts.map((r) => r.role)).toEqual(["autor", "comprador"]);
    expect(receipts[0].declaredName).toBeNull();
    expect(receipts[1].declaredName).toBe("Juan Pérez");
  });

  it("sin todas las confirmaciones no hay constancias", () => {
    expect(() => buildReceipts(CONTENT.selection, RESPONSES.slice(0, 1))).toThrow(ReceiptsError);
    expect(() => buildReceipts(CONTENT.selection, [{ ...RESPONSES[0], decision: "rechazar" }, RESPONSES[1]])).toThrow(ReceiptsError);
  });

  it("solo autor: declaración sin corroboración de terceros", () => {
    expect(receiptsHeadline(buildReceipts(["autor"], [RESPONSES[1]]))).toBe("Declarado por el autor; sin corroboración de terceros.");
  });
});

describe("MVP-081 · PDF final", () => {
  const input = () => ({
    content: CONTENT,
    receipts: buildReceipts(CONTENT.selection, RESPONSES),
    revisionId: "r-fixture",
    snapshotHash: SNAP,
    publicReference: "000102030405060708090a0b0c0d0e0f",
    finalizedAt: "2026-10-16T12:05:00.000Z",
  });

  it("renderiza un PDF con la operación y el anexo de constancias; con el interruptor de la demo omite las advertencias", async () => {
    const pdf = await renderFinalPdf(input());
    expect(Buffer.from(pdf.bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBe(pdf.bytes.byteLength);
    expect(pdf.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pdf.renderer).toBe(RENDERER_VERSION);
    const text = pdfText(pdf.bytes);
    for (const phrase of ["Acuerdo ficticio de entrega", "Operaci", "Constancias de confirmaci", "000102030405060708090a0b0c0d0e0f"]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(DEMO_HIDE_WARNINGS).toBe(true);
    for (const hidden of ["Advertencias informativas", "Fuente B", "Chat indica 10 cajas"]) {
      expect(text, hidden).not.toContain(hidden);
    }
  }, 30_000);

  it("no usa lenguaje de certificación ni de identidad comprobada", async () => {
    const text = pdfText((await renderFinalPdf(input())).bytes).toLowerCase();
    for (const banned of ["certificad", "firma digital", "identidad verificada", "garantizado", "validado regulatoriamente"]) {
      expect(text).not.toContain(banned);
    }
  }, 30_000);

  it("constancias que no corresponden a la selección: no se renderiza", async () => {
    await expect(renderFinalPdf({ ...input(), receipts: input().receipts.slice(0, 1) })).rejects.toThrow();
  });

  it("metadatos fijos: fecha de finalización y productor estable", async () => {
    const raw = Buffer.from((await renderFinalPdf(input())).bytes).toString("latin1");
    expect(raw).toContain("D:20261016120500");
    expect(raw).toContain(RENDERER_VERSION);
  }, 30_000);
});

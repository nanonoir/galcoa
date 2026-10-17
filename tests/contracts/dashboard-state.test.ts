import { describe, expect, it } from "vitest";

import type { DocumentSummary } from "@/lib/contracts/document";

import { DASHBOARD_LOAD_ERROR, toDashboardState } from "@/features/dashboard/containers/dashboard-state";

const summary: DocumentSummary = {
  id: "doc-1",
  title: "Entrega de lote 7",
  documentStatus: "borrador",
  controlStatus: "sin_evaluar",
  confirmationStatus: null,
  hcsStatus: "no_iniciado",
  revisionId: null,
  snapshotId: null,
  updatedAt: "2026-10-16T12:00:00.000Z",
  warnings: [],
};

describe("toDashboardState (MVP-116/I1)", () => {
  it("lista con documentos → ready", () => {
    expect(toDashboardState({ ok: true, value: [summary] })).toEqual({ status: "ready", documents: [summary] });
  });

  it("lista vacía es ready con documents: [] (no error)", () => {
    expect(toDashboardState({ ok: true, value: [] })).toEqual({ status: "ready", documents: [] });
  });

  it("fallo técnico → error visible, nunca lista vacía", () => {
    expect(toDashboardState({ ok: false, error: { retryable: true } })).toEqual({ status: "error", message: DASHBOARD_LOAD_ERROR });
  });

  it("DTO que incumple el contrato se rechaza como error", () => {
    const invalid = { ...summary, documentStatus: "aprobado" } as unknown as DocumentSummary;
    expect(toDashboardState({ ok: true, value: [invalid] })).toEqual({ status: "error", message: DASHBOARD_LOAD_ERROR });
    const extra = { ...summary, ownerId: "x" } as unknown as DocumentSummary;
    expect(toDashboardState({ ok: true, value: [extra] }).status).toBe("error");
  });
});

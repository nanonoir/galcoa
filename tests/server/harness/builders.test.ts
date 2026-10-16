import { describe, expect, it } from "vitest";

import {
  buildConfirmationCommand,
  buildDocumentRecord,
  buildDocumentVersion,
  buildDraft,
  buildEvidence,
  buildHcsSeal,
  buildMessage,
  buildRevision,
  buildSnapshot,
  createIdFactory,
  fakeSha256,
} from "../builders";

describe("builders deterministas", () => {
  it("producen datos válidos y estables entre ejecuciones", () => {
    const first = [buildDocumentRecord(), buildMessage(), buildEvidence(), buildDraft(), buildSnapshot(), buildRevision(), buildDocumentVersion(), buildHcsSeal()];
    const second = [buildDocumentRecord(), buildMessage(), buildEvidence(), buildDraft(), buildSnapshot(), buildRevision(), buildDocumentVersion(), buildHcsSeal()];
    expect(first).toEqual(second);
    expect(fakeSha256("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(fakeSha256("x")).toBe(fakeSha256("x"));
  });

  it("snapshot y revisión comparten identidad y hash por defecto", () => {
    const snapshot = buildSnapshot();
    const revision = buildRevision();
    expect(revision.snapshotId).toBe(snapshot.snapshotId);
    expect(revision.snapshotHash).toBe(snapshot.snapshotHash);
  });

  it("admite comando de tercero y rechaza combinaciones que el contrato no permite", () => {
    const third = buildConfirmationCommand({ actor: "tercero", token: "tok", declaredName: "Comprador Ficticio", documentId: undefined });
    expect(third.actor).toBe("tercero");
    expect(() => buildConfirmationCommand({ decision: "rechazar", checkboxChecked: true })).toThrow();
    expect(() => buildHcsSeal({ status: "registrado" })).toThrow();
  });

  it("la fábrica de ids es determinista y aislada por instancia", () => {
    const a = createIdFactory("x");
    const b = createIdFactory("x");
    expect([a("doc"), a("doc"), a("msg")]).toEqual(["x-doc-0001", "x-doc-0002", "x-msg-0001"]);
    expect(b("doc")).toBe("x-doc-0001");
  });
});

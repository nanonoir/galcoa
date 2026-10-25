import { describe, expect, it } from "vitest";

import type { DocumentSummary } from "@/lib/contracts/document";

import { toActivationChecklist } from "./activation";

const doc = (id: string, patch: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  title: `Documento ${id}`,
  documentStatus: "borrador",
  controlStatus: "sin_evaluar",
  confirmationStatus: null,
  hcsStatus: "no_iniciado",
  revisionId: null,
  snapshotId: null,
  updatedAt: "2026-10-01T10:00:00.000Z",
  warnings: [],
  ...patch,
});

const verified = { revisionId: "rev-1", snapshotId: "snap-1", documentStatus: "esperando_confirmaciones" as const };
const confirmed = { ...verified, confirmationStatus: "completa" as const };
const sealed = { ...confirmed, documentStatus: "finalizado" as const, hcsStatus: "registrado" as const };

const done = (c: ReturnType<typeof toActivationChecklist>) => c.steps.filter((s) => s.done).map((s) => s.id);

describe("toActivationChecklist (una operación coherente)", () => {
  it("sin documentos: ningún paso y nada que continuar", () => {
    const c = toActivationChecklist([]);
    expect(done(c)).toEqual([]);
    expect(c.nextDocumentId).toBeNull();
  });

  it("borrador: solo creado, y propone ese documento", () => {
    const c = toActivationChecklist([doc("a")]);
    expect(done(c)).toEqual(["creado"]);
    expect(c.nextDocumentId).toBe("a");
  });

  it("no combina documentos: confirmaciones de uno y sello de otro no suman", () => {
    // `b` tiene un sello pero ninguna etapa previa: no puede completar los pasos intermedios.
    const c = toActivationChecklist([doc("a", { ...verified, confirmationStatus: "parcial" }), doc("b", { hcsStatus: "registrado" })]);
    expect(done(c)).toEqual(["creado", "verificado"]);
    expect(c.nextDocumentId).toBe("a");
  });

  it("documentos en pasos distintos: gana el más avanzado, no la suma", () => {
    const c = toActivationChecklist([doc("a", { ...verified, confirmationStatus: "parcial" }), doc("b", confirmed), doc("c")]);
    expect(done(c)).toEqual(["creado", "verificado", "confirmado"]);
    expect(c.nextDocumentId).toBe("b");
  });

  it("a igual avance elige el documento más reciente", () => {
    const c = toActivationChecklist([
      doc("viejo", { ...verified, updatedAt: "2026-10-01T10:00:00.000Z" }),
      doc("nuevo", { ...verified, updatedAt: "2026-10-02T10:00:00.000Z" }),
    ]);
    expect(c.nextDocumentId).toBe("nuevo");
  });

  it("una operación sellada completa la guía y no propone seguir", () => {
    const c = toActivationChecklist([doc("a", verified), doc("b", sealed)]);
    expect(done(c)).toEqual(["creado", "verificado", "confirmado", "sellado"]);
    expect(c.nextDocumentId).toBeNull();
  });

  it("finalizado con sello pendiente: confirmado pero no sellado, sigue con ese documento", () => {
    const c = toActivationChecklist([doc("a", { ...confirmed, documentStatus: "finalizado", hcsStatus: "pendiente" })]);
    expect(done(c)).toEqual(["creado", "verificado", "confirmado"]);
    expect(c.nextDocumentId).toBe("a");
  });

  it("borrador con contradicción crítica: no pasa a «verificado», así no propone pedir confirmación", () => {
    const c = toActivationChecklist([doc("a", { controlStatus: "contradiccion_critica", revisionId: "rev-1", snapshotId: "snap-1" })]);
    expect(done(c)).toEqual(["creado"]);
    expect(c.nextDocumentId).toBe("a");
  });

  it("revisión rechazada: verificado, sin confirmar", () => {
    const c = toActivationChecklist([doc("a", { ...verified, documentStatus: "revision_rechazada", confirmationStatus: "rechazada" })]);
    expect(done(c)).toEqual(["creado", "verificado"]);
  });
});

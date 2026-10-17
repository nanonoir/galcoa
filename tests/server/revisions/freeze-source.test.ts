import { describe, expect, it } from "vitest";

import { FreezeSourceSchema, toFreezeSource, type RawFreezeSource } from "@/lib/documents/revisions/freeze-source";

// Datos ficticios; sin base ni IA.
const draft = {
  draftId: "d-1", documentId: "doc-1", draftRevision: 3, updatedAt: "2026-10-16T12:00:00Z",
  content: { title: "Acuerdo ficticio", body: "Se entregan 12 cajas de ejemplo.", corrections: [] as string[] },
};
const raw = (over: Partial<RawFreezeSource> = {}): RawFreezeSource => ({ draft, report: null, refs: [], agent1: null, ...over });

const contrast = {
  result: "contradiccion_critica" as const,
  findings: [{ message: "Las fuentes no coinciden: 10 cajas (m1) y 12 cajas (e1).", severity: "critical" as const, sourceRefs: ["m1", "e1", "b1"] }],
};
const contrastRefs = [{ ref: "m1", kind: "mensaje" as const, id: "msg-1" }, { ref: "e1", kind: "evidencia" as const, id: "evi-1" }];

describe("lectura congelada: un solo tipo de reporte", () => {
  it("sin reportes: sin advertencias y sin evaluar (no se inventa evaluación)", () => {
    expect(toFreezeSource(raw())).toMatchObject({ warnings: [], controlStatus: "sin_evaluar", sourceRefs: {} });
  });

  it("contraste (o histórico sin kind): conserva refs, advertencia crítica y su estado", () => {
    const out = toFreezeSource(raw({ report: contrast, refs: contrastRefs }));
    expect(out.controlStatus).toBe("contradiccion_critica");
    expect(out.sourceRefs).toEqual({ m1: { kind: "mensaje", id: "msg-1" }, e1: { kind: "evidencia", id: "evi-1" } });
    expect(out.warnings).toMatchObject([{ origins: ["agente2"], severity: "critical", sources: ["e1", "m1"], draftRevision: 3 }]);
    expect(out.warnings[0].messages[0]).toContain("(m1)");
  });

  it("solo redacción: sus advertencias se muestran, pero no equivalen a un contraste ni a reglas ejecutadas", () => {
    const out = toFreezeSource(raw({
      agent1: { warnings: [{ message: "Falta la unidad", severity: "warning", sourceRefs: ["m1"] }], refs: [{ ref: "m1", kind: "mensaje", id: "msg-1" }] },
    }));
    expect(out.warnings).toMatchObject([{ origins: ["agente1"], severity: "warning", sources: ["m1"] }]);
    expect(out.controlStatus).toBe("sin_evaluar");
  });
});

describe("lectura congelada: ambos agentes", () => {
  it("mismo ref para fuentes distintas: no se mezclan; la misma fuente conserva un único ref", () => {
    const out = toFreezeSource(raw({
      report: contrast,
      refs: contrastRefs,
      agent1: {
        // En la redacción `m1` es OTRO mensaje y `e2` la evidencia que el contraste llama `e1`.
        refs: [{ ref: "m1", kind: "mensaje", id: "msg-2" }, { ref: "e2", kind: "evidencia", id: "evi-1" }],
        warnings: [
          { message: "Revisar el mensaje (m1)", severity: "warning", sourceRefs: ["m1"] },
          { message: "Evidencia dudosa (e2)", severity: "warning", sourceRefs: ["e2"] },
        ],
      },
    }));
    expect(out.sourceRefs).toEqual({
      m1: { kind: "mensaje", id: "msg-1" }, e1: { kind: "evidencia", id: "evi-1" }, m2: { kind: "mensaje", id: "msg-2" },
    });
    const byMessage = Object.fromEntries(out.warnings.map((w) => [w.messages[0], w]));
    expect(byMessage["Revisar el mensaje (m2)"]).toMatchObject({ origins: ["agente1"], sources: ["m2"] });
    expect(byMessage["Evidencia dudosa (e1)"]).toMatchObject({ origins: ["agente1"], sources: ["e1"] });
    expect(byMessage["Las fuentes no coinciden: 10 cajas (m1) y 12 cajas (e1)."]).toMatchObject({ origins: ["agente2"], severity: "critical", sources: ["e1", "m1"] });
    expect(out.controlStatus).toBe("contradiccion_critica");
  });

  it("la misma advertencia en ambos agentes se agrupa y conserva ambos orígenes", () => {
    const finding = { message: "La cantidad no coincide", severity: "warning" as const, sourceRefs: ["m1"] };
    const out = toFreezeSource(raw({
      report: { result: "con_advertencias", findings: [finding] },
      refs: [contrastRefs[0]],
      agent1: { warnings: [finding], refs: [contrastRefs[0]] },
    }));
    expect(out.warnings).toMatchObject([{ origins: ["agente1", "agente2"], sources: ["m1"] }]);
    expect(out.controlStatus).toBe("con_advertencias");
  });

  it("una advertencia de la redacción sube el estado aunque el contraste no encontró nada", () => {
    const out = toFreezeSource(raw({
      report: { result: "sin_inconsistencias_criticas_detectadas", findings: [] },
      refs: contrastRefs,
      agent1: { warnings: [{ message: "Dato dudoso", severity: "warning", sourceRefs: ["m1"] }], refs: [contrastRefs[0]] },
    }));
    expect(out.controlStatus).toBe("con_advertencias");
  });

  it("refs sin fuente resoluble se descartan sin perder la advertencia ni dejar alias huérfanos", () => {
    const out = toFreezeSource(raw({
      agent1: { warnings: [{ message: "Revisar (e9)", severity: "warning", sourceRefs: ["m1", "e9"] }], refs: [contrastRefs[0], { ref: "e9", kind: "evidencia", id: null }] },
    }));
    expect(out.warnings).toMatchObject([{ messages: ["Revisar (fuente no identificada)"], sources: ["m1"] }]);
    expect(Object.keys(out.sourceRefs)).toEqual(["m1"]);
  });
});

describe("forma desconocida: falla cerrado", () => {
  it("rechaza claves o severidades desconocidas y refs inválidos de la redacción", () => {
    const bad = [
      { ...raw(), extra: 1 },
      raw({ agent1: { warnings: [{ message: "x", severity: "info" as never, sourceRefs: ["m1"] }], refs: [] } }),
      raw({ agent1: { warnings: [{ message: "x", severity: "warning", sourceRefs: ["zz"] }], refs: [] } }),
      raw({ agent1: { warnings: [{ message: "x", severity: "warning", sourceRefs: [] }], refs: [] } }),
      { ...raw(), agent1: undefined },
    ];
    for (const candidate of bad) expect(FreezeSourceSchema.safeParse(candidate).success).toBe(false);
  });

  it("rechaza un reporte vigente corrupto tal como lo entrega la base (no se omite)", () => {
    const corrupt = [
      { ...raw(), report: { result: "aprobado", findings: [] } },
      { ...raw(), report: { result: "con_advertencias", findings: "roto" } },
      { ...raw(), report: { result: "con_advertencias", findings: null } },
      { ...raw(), agent1: { warnings: "no es una lista", refs: [] } },
      { ...raw(), agent1: { warnings: null, refs: [] } },
    ];
    for (const candidate of corrupt) expect(FreezeSourceSchema.safeParse(candidate).success).toBe(false);
  });

  it("la severidad crítica no bloquea: solo informa el estado", () => {
    const out = toFreezeSource(raw({ report: contrast, refs: contrastRefs }));
    expect(out.controlStatus).toBe("contradiccion_critica");
    expect(out.warnings).toHaveLength(1);
  });
});

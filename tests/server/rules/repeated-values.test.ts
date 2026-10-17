import { describe, expect, it } from "vitest";

import { toFreezeSource, type RawFreezeSource } from "@/lib/documents/revisions/freeze-source";
import { buildFrozenSnapshot } from "@/lib/documents/revisions/freeze";
import { ENABLED_INDICATORS } from "@/lib/rules/indicators";
import { evaluateRepeatedValues, extractNumbers, type SeriesSource } from "@/lib/rules/repeated-values";

// Datos ficticios; sin base ni IA.
const draft = {
  draftId: "d-1", documentId: "doc-1", draftRevision: 2, updatedAt: "2026-10-17T12:00:00Z",
  content: { title: "Registro ficticio", body: "Mediciones de ejemplo.", corrections: [] as string[] },
};
const raw = (over: Partial<RawFreezeSource> = {}): RawFreezeSource => ({ draft, report: null, refs: [], agent1: null, ...over });
const message = (id: string, text: string): SeriesSource => ({ kind: "mensaje", id, text });

describe("valores repetidos (MVP-013): umbral 4", () => {
  it("3 idénticos consecutivos: sin señal; 4: señal", () => {
    expect(evaluateRepeatedValues([message("a", "Temperaturas: 5 5 5 6")])).toMatchObject({ evaluated: true, signals: [] });
    const four = evaluateRepeatedValues([message("a", "Temperaturas: 5 5 5 5 6")]);
    expect(four.evaluated).toBe(true);
    expect(four.signals).toHaveLength(1);
    expect(four.signals[0].finding).toMatchObject({ code: "valores_repetidos", outcome: "senal", severity: "warning", params: { repeatedRun: 4 } });
  });

  it("5,0 y 5.0 son el mismo valor; fechas, horas y códigos no cuentan", () => {
    expect(extractNumbers("08:00 5,0 / 2026-10-17 5.0 lote A12 5 m3 5")).toEqual([5, 5, 5, 5]);
    expect(extractNumbers("tel 5491155551234")).toEqual([]);
  });

  it("sin datos suficientes: no se evalúa ni se emite advertencia", () => {
    expect(evaluateRepeatedValues([message("a", "Se entregaron 5 cajas, 5 y 5")])).toEqual({ evaluated: false, signals: [] });
    expect(evaluateRepeatedValues([])).toEqual({ evaluated: false, signals: [] });
    const out = toFreezeSource(raw(), [message("a", "Solo texto, sin cifras")]);
    expect(out).toMatchObject({ warnings: [], controlStatus: "sin_evaluar" });
  });
});

describe("valores repetidos en el congelado", () => {
  const repeated = [message("msg-1", "5 5 5 5"), { kind: "evidencia" as const, id: "evi-1", text: "Lecturas 7,5 7.5 7,5 7.5 7,5" }];

  it("emite una advertencia de reglas por fuente, con refs propios y control con_advertencias", () => {
    const out = toFreezeSource(raw(), repeated);
    expect(out.controlStatus).toBe("con_advertencias");
    expect(out.warnings).toHaveLength(2);
    expect(out.warnings.every((w) => w.origins.length === 1 && w.origins[0] === "reglas" && w.severity === "warning")).toBe(true);
    expect(Object.values(out.sourceRefs)).toEqual(expect.arrayContaining([{ kind: "mensaje", id: "msg-1" }, { kind: "evidencia", id: "evi-1" }]));
  });

  it("con reglas evaluadas y sin señal: sin inconsistencias críticas detectadas (no sin_evaluar)", () => {
    expect(toFreezeSource(raw(), [message("a", "1 2 3 4 5")]).controlStatus).toBe("sin_inconsistencias_criticas_detectadas");
  });

  it("se consolida con Agente 1 y Agente 2 sin perder ninguna", () => {
    const out = toFreezeSource(
      raw({
        report: { result: "con_advertencias", findings: [{ message: "Revisar (m1)", severity: "warning", sourceRefs: ["m1"] }] },
        refs: [{ ref: "m1", kind: "mensaje", id: "msg-1" }],
        agent1: { warnings: [{ message: "Falta la unidad", severity: "warning", sourceRefs: ["m1"] }], refs: [{ ref: "m1", kind: "mensaje", id: "msg-1" }] },
      }),
      [message("msg-1", "5 5 5 5")],
    );
    expect(out.warnings.flatMap((w) => w.origins).sort()).toEqual(["agente1", "agente2", "reglas"]);
    expect(out.sourceRefs).toEqual({ m1: { kind: "mensaje", id: "msg-1" } });
  });

  it("una advertencia crítica previa se conserva: las reglas no la rebajan", () => {
    const out = toFreezeSource(
      raw({ report: { result: "contradiccion_critica", findings: [{ message: "No coinciden", severity: "critical", sourceRefs: ["m1"] }] }, refs: [{ ref: "m1", kind: "mensaje", id: "msg-9" }] }),
      repeated,
    );
    expect(out.controlStatus).toBe("contradiccion_critica");
  });

  it("no bloquea el congelado y el snapshot no lleva términos prohibidos ni acusaciones", () => {
    const out = toFreezeSource(raw(), repeated);
    const frozen = buildFrozenSnapshot({
      content: out.draft.content,
      warnings: out.warnings,
      describeSource: (ref) => out.sourceDescriptions[ref] ?? "Fuente aportada",
      selection: ["autor"],
    });
    expect(frozen.content.warnings).toHaveLength(2);
    expect(frozen.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    const text = JSON.stringify(frozen.content.warnings);
    expect(text).not.toMatch(/certificad|validado regulatoriamente|garantizado verdadero|firma digital|identidad verificada/i);
    expect(text).not.toMatch(/fraude|manipul|falso|falsific|sospech|engañ|bloque|culpa/i);
  });
});

describe("indicadores descartados por decisión de producto", () => {
  it("solo valores_repetidos está habilitado y el congelado no emite los demás", () => {
    expect(ENABLED_INDICATORS).toEqual(["valores_repetidos"]);
    const out = toFreezeSource(raw(), repeated());
    const codes = out.warnings.flatMap((w) => w.messages);
    expect(codes.join(" ")).not.toMatch(/despu[eé]s del hecho declarado|momentos distintos|se modific/i);
  });
});

function repeated(): SeriesSource[] {
  return [message("m", "9 9 9 9")];
}

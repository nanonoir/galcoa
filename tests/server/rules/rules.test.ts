import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ParticipantSelection } from "@/lib/contracts/review";
import { consolidateWarnings, missingData, projectSharedWarnings, quantityContradiction, ruleWarnings, type WarningInput } from "@/lib/rules/consolidate";
import { confirmationStatus, controlStatus, hcsStatus, provenance, RuleInputError } from "@/lib/rules/dimensions";
import { lateUpload, pdfMetadata, repeatedValues, retroactiveBatch, type IndicatorThresholds } from "@/lib/rules/indicators";

// Datos ficticios. Umbrales de ejemplo: propuestos, no aprobados.
const THRESHOLDS: IndicatorThresholds = { lateUploadHours: 24, retroactiveBatch: { windowMinutes: 5, minCount: 3 }, repeatedRun: 4, pdfModificationHours: 1 };
const at = (iso: string) => ({ kind: "declared" as const, originalText: iso, precision: "datetime" as const, timeZone: "-03:00", instant: iso });

describe("MVP-060 · control documental", () => {
  const base = { draftRevision: 2, findings: [], rulesEvaluated: false };

  it("sin reporte vigente ni reglas: sin_evaluar, nunca «sin inconsistencias»", () => {
    expect(controlStatus({ ...base, agent2: null })).toBe("sin_evaluar");
  });

  it("un reporte de otra revisión está desactualizado y no cuenta", () => {
    expect(controlStatus({ ...base, agent2: { draftRevision: 1, result: "sin_inconsistencias_criticas_detectadas" } })).toBe("sin_evaluar");
  });

  it.each([
    [{ result: "sin_inconsistencias_criticas_detectadas" }, [], "sin_inconsistencias_criticas_detectadas"],
    [{ result: "con_advertencias" }, [], "con_advertencias"],
    [{ result: "sin_inconsistencias_criticas_detectadas" }, [{ severity: "warning", draftRevision: 2 }], "con_advertencias"],
    [{ result: "con_advertencias" }, [{ severity: "critical", draftRevision: 2 }], "contradiccion_critica"],
    [{ result: "contradiccion_critica" }, [], "contradiccion_critica"],
    [{ result: "sin_inconsistencias_criticas_detectadas" }, [{ severity: "critical", draftRevision: 1 }], "sin_inconsistencias_criticas_detectadas"],
  ] as const)("precedencia %#", (agent2, findings, expected) => {
    expect(controlStatus({ ...base, agent2: { draftRevision: 2, ...agent2 }, findings })).toBe(expected);
  });

  it("solo reglas ejecutadas también es una evaluación", () => {
    expect(controlStatus({ ...base, agent2: null, rulesEvaluated: true })).toBe("sin_inconsistencias_criticas_detectadas");
  });

  it("revisión inválida: error explícito", () => {
    expect(() => controlStatus({ ...base, draftRevision: -1, agent2: null })).toThrow(RuleInputError);
  });

  it("es determinista: misma entrada, mismo resultado", () => {
    const input = { ...base, agent2: { draftRevision: 2, result: "con_advertencias" as const }, findings: [{ severity: "warning" as const, draftRevision: 2 }] };
    expect(new Set(Array.from({ length: 20 }, () => controlStatus(input))).size).toBe(1);
  });
});

describe("MVP-060 · confirmaciones, procedencia y sello", () => {
  const all: ParticipantSelection = ["autor", "intermediario", "comprador"];
  const C = "confirmado" as const;
  const R = "rechazado" as const;

  it.each([
    [["autor"], [], false, "pendiente", null],
    [["autor"], [["autor", C]], false, "completa", "declarado_por_autor"],
    [["autor", "comprador"], [["autor", C]], false, "parcial", null],
    [["autor", "comprador"], [["autor", C], ["comprador", C]], false, "completa", "declarado_y_corroborado_por_tercero"],
    [["autor", "intermediario"], [["intermediario", R]], false, "rechazada", null],
    [all, [["autor", C], ["intermediario", C]], false, "parcial", null],
    [all, [["autor", C], ["intermediario", C], ["comprador", C]], false, "completa", "declarado_y_corroborado_por_tercero"],
    [all, [["autor", C], ["intermediario", C], ["comprador", R]], false, "rechazada", null],
    [all, [["autor", C]], true, "sustituida", null],
  ] as const)("%j con %j (sustituida=%s) → %s / %s", (selection, responses, superseded, status, prov) => {
    const s = confirmationStatus({
      selection: selection as unknown as ParticipantSelection,
      responses: responses.map(([role, response]) => ({ role, response })),
      superseded,
    });
    expect(s).toBe(status);
    expect(provenance(selection as unknown as ParticipantSelection, s)).toBe(prov);
  });

  it("respuesta de un rol no seleccionado o duplicada: error", () => {
    expect(() => confirmationStatus({ selection: ["autor"], responses: [{ role: "comprador", response: C }], superseded: false })).toThrow(RuleInputError);
    expect(() =>
      confirmationStatus({ selection: ["autor"], responses: [{ role: "autor", response: C }, { role: "autor", response: C }], superseded: false }),
    ).toThrow(RuleInputError);
  });

  it("sello: no_iniciado sin versión; pendiente sin registro probado; registrado solo con prueba", () => {
    expect(hcsStatus({ finalizedVersion: false, provenRegistration: false })).toBe("no_iniciado");
    expect(hcsStatus({ finalizedVersion: true, provenRegistration: false })).toBe("pendiente");
    expect(hcsStatus({ finalizedVersion: true, provenRegistration: true })).toBe("registrado");
    expect(() => hcsStatus({ finalizedVersion: false, provenRegistration: true })).toThrow(RuleInputError);
  });
});

describe("MVP-061 · señales ALCOA+", () => {
  it("carga tardía: señal con texto neutro y parámetros; sin instante declarado, no evaluada", () => {
    const late = lateUpload({ ref: "m1", declaredEventDate: at("2026-10-10T13:00:00Z"), uploadedAt: "2026-10-12T13:00:00Z" }, THRESHOLDS);
    expect(late).toMatchObject({ outcome: "senal", severity: "warning", sources: ["m1"], params: { observedHours: 48 } });
    expect(late.message).toMatch(/^Señal de revisión/);
    expect(lateUpload({ ref: "m1", declaredEventDate: at("2026-10-12T12:00:00Z"), uploadedAt: "2026-10-12T13:00:00Z" }, THRESHOLDS).outcome).toBe("sin_senal");
    const day = { kind: "declared" as const, originalText: "5/10", precision: "day" as const, timeZone: null, instant: null };
    expect(lateUpload({ ref: "m1", declaredEventDate: day, uploadedAt: "2026-10-12T13:00:00Z" }, THRESHOLDS)).toMatchObject({ outcome: "no_evaluado", reason: "fecha_sin_instante" });
    expect(lateUpload({ ref: "m1", declaredEventDate: { kind: "unknown" }, uploadedAt: "2026-10-12T13:00:00Z" }, THRESHOLDS).outcome).toBe("no_evaluado");
  });

  it("sin umbral configurado: «no evaluado», sin valores ocultos", () => {
    const none: IndicatorThresholds = {};
    for (const f of [
      lateUpload({ ref: "m1", declaredEventDate: at("2026-10-01T00:00:00Z"), uploadedAt: "2026-10-12T00:00:00Z" }, none),
      retroactiveBatch([], none),
      repeatedValues([{ ref: "m1", value: 1 }], none),
      pdfMetadata({ ref: "e1", metadata: { createdAt: "2026-10-01T00:00:00Z", modifiedAt: "2026-10-09T00:00:00Z", producer: null } }, none),
    ]) {
      expect(f).toMatchObject({ outcome: "no_evaluado", reason: "umbral_no_configurado", message: "No evaluado: umbral no configurado." });
    }
  });

  it("lote retroactivo: varias cargas en minutos con hechos de días distintos", () => {
    const batch = ["2026-10-01", "2026-10-03", "2026-10-05"].map((d, i) => ({
      ref: `m${i + 1}`,
      declaredEventDate: at(`${d}T12:00:00Z`),
      uploadedAt: `2026-10-12T15:0${i}:00Z`,
    }));
    expect(retroactiveBatch(batch, THRESHOLDS)).toMatchObject({ outcome: "senal", sources: ["m1", "m2", "m3"] });
    const spread = batch.map((b, i) => ({ ...b, uploadedAt: `2026-10-1${i}T15:00:00Z` }));
    expect(retroactiveBatch(spread, THRESHOLDS).outcome).toBe("sin_senal");
  });

  it("valores repetidos: racha mínima configurada", () => {
    const values = [7.1, 7.1, 7.1, 7.1, 6.9].map((value, i) => ({ ref: `m${i + 1}`, value }));
    expect(repeatedValues(values, THRESHOLDS)).toMatchObject({ outcome: "senal", sources: ["m1", "m2", "m3", "m4"] });
    expect(repeatedValues(values.slice(1), THRESHOLDS).outcome).toBe("sin_senal");
  });

  it("metadatos PDF: sin metadatos no se presume nada", () => {
    expect(pdfMetadata({ ref: "e1", metadata: null }, THRESHOLDS)).toMatchObject({ outcome: "no_evaluado", reason: "sin_metadatos" });
    expect(
      pdfMetadata({ ref: "e1", metadata: { createdAt: "2026-10-01T10:00:00Z", modifiedAt: "2026-10-03T10:00:00Z", producer: "Editor X" } }, THRESHOLDS),
    ).toMatchObject({ outcome: "senal", params: { producer: "Editor X" } });
  });

  it("ningún texto acusa ni bloquea", () => {
    const texts = [
      lateUpload({ ref: "m1", declaredEventDate: at("2026-10-01T00:00:00Z"), uploadedAt: "2026-10-12T00:00:00Z" }, THRESHOLDS),
      repeatedValues([1, 1, 1, 1].map((value, i) => ({ ref: `m${i + 1}`, value })), THRESHOLDS),
    ];
    for (const f of texts) {
      expect(JSON.stringify(f)).not.toMatch(/fraude|manipul|falso|bloque/i);
      expect(f.severity).toBe("warning");
      expect(f).not.toHaveProperty("blocking");
    }
  });
});

describe("MVP-062 · consolidación y proyección compartible", () => {
  it("10 vs 12 cajas: ambas cifras y fuentes visibles, crítica, sin elegir ni bloquear", () => {
    const { current } = consolidateWarnings([quantityContradiction({ value: "10 cajas", ref: "m1" }, { value: "12 cajas", ref: "e1" }, 3)], 3);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ severity: "critical", sources: ["e1", "m1"] });
    expect(current[0].messages[0]).toContain("10 cajas");
    expect(current[0].messages[0]).toContain("12 cajas");
    expect(current[0]).not.toHaveProperty("blocking");
  });

  it("unidad y fecha ausentes: advertencias explícitas", () => {
    const { current } = consolidateWarnings([missingData("unidad", "m1", 1), missingData("fecha", "m1", 1)], 1);
    expect(current.map((w) => w.messages[0]).sort()).toEqual(["Fecha no informada.", "Unidad no informada."]);
  });

  it("agrupa solo con clave determinista y conserva los orígenes", () => {
    const inputs: WarningInput[] = [
      { origin: "agente2", draftRevision: 1, code: null, message: "La cantidad no coincide", severity: "critical", sources: ["m1", "e1", "b1"] },
      { origin: "agente1", draftRevision: 1, code: null, message: "la cantidad  no coincide", severity: "warning", sources: ["e1", "m1"] },
      { origin: "agente1", draftRevision: 1, code: null, message: "Falta el precio", severity: "warning", sources: ["m1"] },
    ];
    const { current } = consolidateWarnings(inputs, 1);
    expect(current).toHaveLength(2);
    expect(current[0]).toMatchObject({ origins: ["agente1", "agente2"], severity: "critical", sources: ["e1", "m1"] });
    const reversed = consolidateWarnings([...inputs].reverse(), 1).current;
    expect(reversed.map((w) => w.key)).toEqual(current.map((w) => w.key));
  });

  it("advertencias de otra revisión quedan desactualizadas y no entran en la vigente", () => {
    const { current, stale } = consolidateWarnings(
      [
        { origin: "agente2", draftRevision: 1, code: null, message: "Vieja", severity: "critical", sources: ["m1"] },
        { origin: "agente2", draftRevision: 2, code: null, message: "Nueva", severity: "warning", sources: ["m1"] },
      ],
      2,
    );
    expect(current.map((w) => w.messages[0])).toEqual(["Nueva"]);
    expect(stale.map((w) => w.messages[0])).toEqual(["Vieja"]);
  });

  it("las reglas sin señal o no evaluadas no son advertencias", () => {
    const findings = [
      repeatedValues([1, 1, 1, 1].map((value, i) => ({ ref: `m${i + 1}`, value })), THRESHOLDS),
      repeatedValues([1, 2].map((value, i) => ({ ref: `m${i + 1}`, value })), {}),
    ];
    expect(ruleWarnings(findings, 1)).toHaveLength(1);
  });

  it("proyección compartible: alias, sin refs privadas ni rutas; tabla privada aparte", () => {
    const { current } = consolidateWarnings([quantityContradiction({ value: "10 cajas", ref: "m1" }, { value: "12 cajas", ref: "e1" }, 1)], 1);
    const descriptions: Record<string, string> = { m1: "mensaje del autor: 10 cajas", e1: "remito aportado: 12 cajas" };
    const { shared, aliasTable } = projectSharedWarnings(current, (ref) => descriptions[ref]);
    const json = JSON.stringify(shared);
    expect(json).not.toMatch(/\b[me]\d\b|http|\/|\.pdf/);
    expect(shared[0].sources.map((s) => s.alias)).toEqual(["Fuente A", "Fuente B"]);
    expect(shared[0].message).toContain("Fuente");
    expect(aliasTable).toEqual([
      { alias: "Fuente A", ref: "e1" },
      { alias: "Fuente B", ref: "m1" },
    ]);
  });
});

describe("Pureza del motor", () => {
  it("src/lib/rules solo importa contratos y no usa reloj, red ni entorno", () => {
    const dir = path.resolve(import.meta.dirname, "../../../src/lib/rules");
    for (const file of readdirSync(dir)) {
      const source = readFileSync(path.join(dir, file), "utf8");
      for (const line of source.split(/\r?\n/).filter((l) => l.startsWith("import "))) {
        expect(line, file).toMatch(/from "(@\/lib\/contracts\/[\w-]+|\.\/[\w-]+)"/);
      }
      expect(source, file).not.toMatch(/Date\.now|new Date\(\)|Math\.random|process\.env|fetch\(/);
    }
  });
});

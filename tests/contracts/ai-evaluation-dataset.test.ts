import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CasesFileSchema,
  canonicalJson,
  controlStatusFor,
  EvalCaseSchema,
  CaseLabelSchema,
  LabelsFileSchema,
  LabelsLockSchema,
} from "../../evals/ai/dataset/schema";

/**
 * MVP-122: forma, cobertura y congelamiento del dataset de evaluación.
 * Valida datos ficticios; no ejecuta modelos ni mide calidad.
 */

const dir = path.resolve(import.meta.dirname, "../../evals/ai/dataset");
const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(dir, file), "utf8"));

const casesFile = CasesFileSchema.parse(readJson("cases.v1.json"));
const labelsFile = LabelsFileSchema.parse(readJson("labels.v1.json"));
const cases = casesFile.cases;
const labels = labelsFile.labels;
const labelById = new Map(labels.map((l) => [l.caseId, l]));

describe("Dataset de evaluación v1 (MVP-122)", () => {
  it("tiene 30 casos con ids únicos C01…C30 y una etiqueta por caso", () => {
    expect(cases.map((c) => c.id)).toEqual(
      Array.from({ length: 30 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
    );
    expect(labels.map((l) => l.caseId)).toEqual(cases.map((c) => c.id));
  });

  it("reparte 15 correctos y 15 con errores sembrados", () => {
    const clean = labels.filter((l) => l.expectedWarnings.length === 0);
    expect(clean).toHaveLength(15);
    expect(labels.length - clean.length).toBe(15);
  });

  it("cubre los tipos de caso que pide el plan F12 (Q1)", () => {
    const categories = new Set(cases.map((c) => c.category));
    for (const required of [
      "correcto",
      "ortografia_inocua",
      "cantidad_contradictoria",
      "precio_contradictorio",
      "unidad_ausente",
      "fecha_ausente",
      "destinatario_distinto",
      "carga_posterior",
      "valor_distinto_evidencia",
    ] as const) {
      expect(categories, required).toContain(required);
    }
    expect(cases.some((c) => c.sources.some((s) => s.kind === "extraccion"))).toBe(true);
  });

  it("identifica 12 casos demo: 6 correctos y 6 con errores", () => {
    const demo = cases.filter((c) => c.demo);
    expect(demo).toHaveLength(12);
    const demoClean = demo.filter((c) => labelById.get(c.id)!.expectedWarnings.length === 0);
    expect(demoClean).toHaveLength(6);
  });

  it("cada etiqueta es coherente con su caso", () => {
    for (const c of cases) {
      const label = labelById.get(c.id)!;
      const refs = new Set(c.sources.map((s) => s.ref));
      const cited = [
        ...label.expectedWarnings.flatMap((w) => w.sources),
        ...label.allowedFacts.flatMap((f) => f.sources),
      ];
      for (const ref of cited) expect(refs, `${c.id} cita ${ref}`).toContain(ref);

      expect(label.expectedControlStatus, c.id).toBe(controlStatusFor(label.expectedWarnings));
      expect(label.dependsOnGeminiExtraction, c.id).toBe(c.sources.some((s) => s.kind === "extraccion"));

      const isClean = c.category === "correcto" || c.category === "ortografia_inocua";
      expect(label.expectedWarnings.length === 0, c.id).toBe(isClean);
      expect(label.innocuousCorrections.length > 0, c.id).toBe(c.category === "ortografia_inocua");
    }
  });

  it("las contradicciones de cantidad, precio, destino o valor son críticas; las omisiones, advertencias", () => {
    const critical = new Set(["cantidad_contradictoria", "precio_contradictorio", "destinatario_distinto", "valor_distinto_entre_fuentes"]);
    for (const w of labels.flatMap((l) => l.expectedWarnings)) {
      expect(w.severity, w.type).toBe(critical.has(w.type) ? "critical" : "warning");
    }
  });

  it("las etiquetas están congeladas: el hash canónico coincide con el lock", () => {
    const lock = LabelsLockSchema.parse(readJson("labels.lock.json"));
    const hash = createHash("sha256").update(canonicalJson(readJson("labels.v1.json"))).digest("hex");
    expect(hash).toBe(lock.canonicalSha256);
    expect(lock.evaluatedModelsRunBeforeFreeze).toBe(false);
  });

  it("el JSON canónico no depende del orden de las claves", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it("el esquema del dataset no importa el módulo de IA ni proveedores", () => {
    const imports = readFileSync(path.join(dir, "schema.ts"), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("import "));
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).not.toMatch(/lib\/ai|@ai-sdk|groq-sdk|from "ai"/);
  });
});

describe("Negativos del esquema (MVP-122)", () => {
  const validCase = cases[0];
  const validLabel = labels[0];

  it.each([
    ["id con formato inválido", { ...validCase, id: "caso-1" }],
    ["clave extra", { ...validCase, extra: true }],
    ["sin fuentes", { ...validCase, sources: [] }],
    ["mensaje con ref de extracción", { ...validCase, sources: [{ ...validCase.sources[0], ref: "e1" }] }],
    ["refs duplicadas", { ...validCase, sources: [validCase.sources[0], validCase.sources[0]] }],
  ])("rechaza un caso con %s", (_, value) => {
    expect(EvalCaseSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["estado sin_evaluar", { ...validLabel, expectedControlStatus: "sin_evaluar" }],
    ["tipo de advertencia desconocido", { ...validLabel, expectedWarnings: [{ type: "fraude", severity: "critical", sources: ["m1"] }] }],
    ["advertencia que bloquea", { ...validLabel, expectedWarnings: [{ type: "fecha_no_informada", severity: "blocking", sources: ["m1"] }] }],
    ["sin datos permitidos", { ...validLabel, allowedFacts: [] }],
    ["sin justificación", { ...validLabel, justification: "" }],
  ])("rechaza una etiqueta con %s", (_, value) => {
    expect(CaseLabelSchema.safeParse(value).success).toBe(false);
  });

  it("rechaza un lock que declare corridas previas al congelamiento", () => {
    const lock = readJson("labels.lock.json") as Record<string, unknown>;
    expect(LabelsLockSchema.safeParse({ ...lock, evaluatedModelsRunBeforeFreeze: true }).success).toBe(false);
  });
});

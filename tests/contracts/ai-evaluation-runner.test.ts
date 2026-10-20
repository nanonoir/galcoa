import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DRAFTING_PROMPT_VERSION } from "../../src/lib/ai/prompts/drafting/v2";
import { computeMetrics, scoreRun } from "../../evals/ai/metrics";
import { buildRecord, renderTable } from "../../evals/ai/report";
import { loadDataset, runEvaluation, type CaseRun, type EvalServices } from "../../evals/ai/runner";

// Solo para importar los servicios reales en este archivo: `server-only` no tiene
// efecto en tests. Ningún proveedor real se crea: los puertos son dobles.
vi.mock("server-only", () => ({}));

/**
 * MVP-123: cálculo determinista de métricas con corridas sintéticas, runner
 * con dobles y aislamiento de CI. No mide la calidad de ningún modelo.
 */

const root = path.resolve(import.meta.dirname, "../..");
const dataset = loadDataset();
const label = (id: string) => dataset.labels.get(id)!;

type Finding = { message: string; severity: "warning" | "critical"; sourceRefs: string[] };
const proposal = (over: Partial<{ facts: { field: string; value: string }[]; notInformed: string[] }> = {}) => ({
  title: "Entrega",
  body: "Texto",
  facts: (over.facts ?? []).map((f) => ({ ...f, sourceRef: "m1", quote: f.value })),
  corrections: [],
  notInformed: over.notInformed ?? [],
  warnings: [],
});

/** Corrida sintética con contraste exitoso. */
function run(caseId: string, findings: Finding[], over: { repetition?: number; result?: string; facts?: { field: string; value: string }[]; notInformed?: string[] } = {}): CaseRun {
  const result =
    over.result ??
    (findings.some((f) => f.severity === "critical")
      ? "contradiccion_critica"
      : findings.length
        ? "con_advertencias"
        : "sin_inconsistencias_criticas_detectadas");
  return {
    caseId,
    repetition: over.repetition ?? 1,
    demo: dataset.cases.find((c) => c.id === caseId)!.demo,
    startedAt: "2026-10-16T18:00:00.000Z",
    drafting: {
      ok: true,
      attempts: 1,
      modelId: "modelo-redaccion-ficticio",
      promptVersion: "drafting-v1",
      inputs: ["m1"],
      proposal: proposal({ facts: over.facts, notInformed: over.notInformed ?? label(caseId).notInformed }),
    },
    contrast: {
      ok: true,
      attempts: 1,
      modelId: "modelo-contraste-ficticio",
      promptVersion: "contrast-v1",
      inputs: ["m1", "b1"],
      result: result as "contradiccion_critica",
      findings,
      limitations: [],
    },
  };
}

const failed = (caseId: string, stage: "drafting" | "contrast", code = "AI_TIMEOUT"): CaseRun => {
  const base = run(caseId, []);
  const error = { code, stage: "ia" as const, retryable: true };
  return stage === "drafting"
    ? { ...base, drafting: { ok: false, attempts: 2, error }, contrast: null }
    : { ...base, contrast: { ok: false, attempts: 2, error } };
};

const crit = (...refs: string[]): Finding => ({ message: "Diferencia", severity: "critical", sourceRefs: refs });
const warn = (...refs: string[]): Finding => ({ message: "Falta un dato", severity: "warning", sourceRefs: refs });

describe("Puntaje de una corrida (MVP-123)", () => {
  it("detecta la advertencia etiquetada si el hallazgo comparte una fuente", () => {
    const s = scoreRun(run("C16", [crit("m1", "e1", "b1")]), label("C16"));
    expect(s).toMatchObject({ detected: [0], omitted: [], falsePositives: 0, reportedStatus: "contradiccion_critica" });
  });

  it("un hallazgo que solo cita el borrador no detecta nada y es falso positivo", () => {
    const s = scoreRun(run("C16", [crit("b1")]), label("C16"));
    expect(s).toMatchObject({ detected: [], omitted: [0], falsePositives: 1 });
  });

  it("en un caso correcto, todo hallazgo es falso positivo", () => {
    const s = scoreRun(run("C01", [warn("m1")]), label("C01"));
    expect(s).toMatchObject({ expectedWarnings: 0, falsePositives: 1, reportedStatus: "con_advertencias" });
  });

  it("marca como candidato a inventado un hecho en un campo «no informado», sin acentos ni mayúsculas", () => {
    const s = scoreRun(run("C01", [], { facts: [{ field: "Precio", value: "$5.000" }] }), label("C01"));
    expect(s.inventedCandidates).toEqual([{ field: "Precio", value: "$5.000" }]);
    const ok = scoreRun(run("C01", [], { facts: [{ field: "cantidad", value: "10 cajas" }] }), label("C01"));
    expect(ok.inventedCandidates).toEqual([]);
  });

  it("registra los campos «no informado» que el borrador no declaró", () => {
    const s = scoreRun(run("C02", [], { notInformed: ["precio"] }), label("C02"));
    expect(s.notInformedMissing).toEqual(["receptor"]);
  });

  it("un fallo técnico no es omisión ni acierto", () => {
    expect(scoreRun(failed("C16", "contrast"), label("C16"))).toMatchObject({
      technicalFailure: { stage: "contraste", code: "AI_TIMEOUT" },
      detected: [],
      omitted: [],
      reportedStatus: null,
    });
    expect(scoreRun(failed("C16", "drafting"), label("C16")).technicalFailure).toEqual({ stage: "redaccion", code: "AI_TIMEOUT" });
  });
});

describe("Métricas agregadas (MVP-123)", () => {
  it("calcula detección, omisiones, falsos positivos y acuerdo de estado con sus denominadores", () => {
    const { metrics } = computeMetrics(
      [
        run("C16", [crit("m1", "e1")]), // detecta 1/1
        run("C21", []), // omite 1, estado distinto
        run("C29", [crit("m1")]), // cubre las 2 advertencias (comparten fuentes)
        run("C01", [warn("m1")]), // correcto con hallazgo
        run("C03", []), // correcto limpio
        failed("C19", "contrast"),
      ],
      dataset,
    );
    expect(metrics.runs).toBe(6);
    expect(metrics.evaluatedRuns).toBe(5);
    expect(metrics.detection).toEqual({ numerator: 3, denominator: 4, value: 0.75 });
    expect(metrics.omissions).toBe(1);
    expect(metrics.falsePositives).toEqual({
      total: 1,
      runsWithAny: 1,
      cleanCaseRunsWithFindings: { numerator: 1, denominator: 2, value: 0.5 },
    });
    expect(metrics.statusAgreement).toEqual({ numerator: 3, denominator: 5, value: 0.6 });
    expect(metrics.technicalFailures).toEqual({ total: 1, byStageAndCode: { "contraste:AI_TIMEOUT": 1 } });
  });

  it("sin corridas evaluadas no inventa porcentajes", () => {
    const { metrics } = computeMetrics([failed("C16", "drafting")], dataset);
    expect(metrics.detection).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(metrics.statusAgreement.value).toBeNull();
  });

  it("detecta variación entre repeticiones del mismo caso", () => {
    const { metrics } = computeMetrics(
      [
        run("C16", [crit("m1", "e1")], { repetition: 1 }),
        run("C16", [], { repetition: 2 }),
        run("C01", [], { repetition: 1 }),
        run("C01", [], { repetition: 2 }),
        run("C03", [], { repetition: 1 }),
      ],
      dataset,
    );
    expect(metrics.variation).toEqual({ casesCompared: 2, casesWithVariation: ["C16"] });
  });

  it("criterio demo: cumple, no cumple o incompleto; nunca con casos no demo", () => {
    const demoOk = [run("C16", [crit("m1", "e1")]), run("C01", [])];
    expect(computeMetrics(demoOk, dataset).metrics.demoCriterion).toBe("cumple");
    expect(computeMetrics([run("C16", [])], dataset).metrics.demoCriterion).toBe("no_cumple");
    expect(computeMetrics([run("C01", [], { facts: [{ field: "precio", value: "$1" }] })], dataset).metrics.demoCriterion).toBe("no_cumple");
    expect(computeMetrics([...demoOk, failed("C19", "contrast")], dataset).metrics.demoCriterion).toBe("incompleto");
    expect(computeMetrics([run("C17", [crit("m1", "m2")])], dataset).metrics.demoCriterion).toBe("no_aplica");
  });

  it("rechaza una corrida de un caso sin etiqueta", () => {
    expect(() => computeMetrics([{ ...run("C01", []), caseId: "C99" }], dataset)).toThrow(/sin etiqueta/);
  });
});

describe("Registro de la corrida (MVP-123)", () => {
  it("guarda hash de etiquetas, modelos y prompts por versión, sin texto de prompts", () => {
    const runs = [run("C16", [crit("m1", "e1")]), failed("C19", "drafting")];
    const { scores, metrics } = computeMetrics(runs, dataset);
    const record = buildRecord({
      dataset,
      subset: "demo",
      repetitions: 1,
      startedAt: "2026-10-16T18:00:00.000Z",
      finishedAt: "2026-10-16T18:05:00.000Z",
      runs,
      scores,
      metrics,
    });
    expect(record.dataset.labelsSha256).toBe("f2f2061e4bb68a4930e9a697e76e020125e5d147b8edd3067f111a545f47e05e");
    expect(record.models).toEqual({ drafting: ["modelo-redaccion-ficticio"], contrast: ["modelo-contraste-ficticio"] });
    expect(record.promptVersions).toEqual({ drafting: ["drafting-v1"], contrast: ["contrast-v1"] });
    expect(record.promptsIncluded).toBe(false);
    expect(JSON.stringify(record)).not.toContain("Sos el contrastador");

    const table = renderTable(record);
    expect(table).toContain("| Advertencias etiquetadas detectadas | 1/1 |");
    expect(table).toContain("redaccion:AI_TIMEOUT");
    expect(table).toContain("cálculo, no veredicto");
  });
});

/** Dobles de puertos de proveedor: salidas fijas, sin red. */
function fakePorts(contrastFindings: (sources: { id: string }[]) => Finding[]) {
  const gemini = vi.fn(async (): Promise<unknown> => ({
    ok: true as const,
    output: proposal(),
    modelId: "gemini-doble",
    usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
    latencyMs: 1,
    correlationId: "c",
  }));
  const groqCalls: { id: string }[][] = [];
  const groq = vi.fn(async (input: { sources: readonly { id: string }[] }) => {
    groqCalls.push([...input.sources]);
    const findings = contrastFindings([...input.sources]);
    const result = findings.some((f) => f.severity === "critical")
      ? "contradiccion_critica"
      : findings.length
        ? "con_advertencias"
        : "sin_inconsistencias_criticas_detectadas";
    return { ok: true as const, output: { result, findings }, modelId: "groq-doble", latencyMs: 1, correlationId: "c" };
  });
  return {
    gemini: { generateStructured: gemini } as unknown as EvalServices["gemini"],
    groq: { generateStructured: groq } as unknown as EvalServices["groq"],
    geminiCalls: gemini,
    groqCalls,
  };
}

describe("Runner con los servicios reales y dobles de proveedor (MVP-123)", () => {
  it("pasa cada caso por Agente 1 y Agente 2 con las refs del dataset", async () => {
    const { createDraftingService } = await import("@/lib/ai/drafting/service");
    const { createContrastService } = await import("@/lib/ai/groq/contrast");
    const ports = fakePorts((sources) => (sources.some((s) => s.id === "e1") ? [crit("m1", "e1")] : []));

    const runs = await runEvaluation({
      dataset,
      services: { createDraftingService, createContrastService, gemini: ports.gemini, groq: ports.groq },
      subset: "demo",
      repetitions: 2,
    });

    expect(runs).toHaveLength(24);
    const c02 = runs.find((r) => r.caseId === "C02")!;
    expect(c02.drafting).toMatchObject({ ok: true, inputs: ["m1", "e1"], promptVersion: DRAFTING_PROMPT_VERSION });
    expect(c02.contrast).toMatchObject({ ok: true, inputs: ["m1", "e1", "b1"], promptVersion: "contrast-v1", modelId: "groq-doble" });
    expect(ports.groqCalls[0].map((s) => s.id)).toEqual(["m1", "b1"]);

    const { metrics } = computeMetrics(runs, dataset);
    expect(metrics.evaluatedRuns).toBe(24);
    expect(metrics.variation.casesCompared).toBe(12);
  });

  it("reintenta una sola vez un error transitorio y no reintenta uno definitivo", async () => {
    const { createContrastService } = await import("@/lib/ai/groq/contrast");
    const { createDraftingService } = await import("@/lib/ai/drafting/service");
    const ports = fakePorts(() => []);
    const timeout = { ok: false as const, error: { code: "AI_TIMEOUT", stage: "ia" as const, retryable: true, correlationId: "c" } };
    const invalid = { ok: false as const, error: { code: "AI_INVALID_INPUT", stage: "ia" as const, retryable: false, correlationId: "c" } };
    ports.geminiCalls.mockResolvedValueOnce(timeout).mockResolvedValueOnce(timeout).mockResolvedValueOnce(invalid);

    const [first, second] = await runEvaluation({
      dataset: { ...dataset, cases: dataset.cases.slice(0, 2) },
      services: { createDraftingService, createContrastService, gemini: ports.gemini, groq: ports.groq },
      subset: "all",
      repetitions: 1,
    });
    expect(first.drafting).toMatchObject({ ok: false, attempts: 2, error: { code: "AI_TIMEOUT" } });
    expect(first.contrast).toBeNull();
    expect(second.drafting).toMatchObject({ ok: false, attempts: 1, error: { code: "AI_INVALID_INPUT" } });
    expect(ports.groqCalls).toHaveLength(0);
  });

  it("exige repeticiones explícitas y válidas", async () => {
    const ports = fakePorts(() => []);
    const services = { createDraftingService: vi.fn(), createContrastService: vi.fn(), gemini: ports.gemini, groq: ports.groq };
    for (const repetitions of [0, 1.5, -1]) {
      await expect(runEvaluation({ dataset, services, subset: "demo", repetitions })).rejects.toThrow(RangeError);
    }
    expect(services.createDraftingService).not.toHaveBeenCalled();
  });

  it("no evalúa con etiquetas alteradas", async () => {
    const { mkdtempSync, writeFileSync, copyFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(path.join(tmpdir(), "galcoa-eval-"));
    const src = path.join(root, "evals/ai/dataset");
    for (const f of ["cases.v1.json", "labels.lock.json"]) copyFileSync(path.join(src, f), path.join(dir, f));
    const labels = JSON.parse(readFileSync(path.join(src, "labels.v1.json"), "utf8"));
    labels.labels[0].justification = "cambiada después del congelamiento";
    writeFileSync(path.join(dir, "labels.v1.json"), JSON.stringify(labels));
    expect(() => loadDataset(dir)).toThrow(/no coincide/);
  });
});

describe("Ejecución real: solo con habilitación explícita (MVP-123)", () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];

  it("falla sin habilitación ni configuración, antes de crear puertos", async () => {
    const { runLiveEvaluation, EvalConfigError } = await import("../../evals/ai/live");
    const createPorts = vi.fn();
    await expect(runLiveEvaluation({ subset: "demo", repetitions: 1, readEnv: env({}), createPorts })).rejects.toThrow(EvalConfigError);
    await expect(
      runLiveEvaluation({ subset: "demo", repetitions: 1, readEnv: env({ GALCOA_EVAL_LIVE: "1" }), createPorts }),
    ).rejects.toThrow(/Gemini, Groq/);
    await expect(
      runLiveEvaluation({
        subset: "demo",
        repetitions: 1,
        readEnv: env({ GALCOA_EVAL_LIVE: "1", GOOGLE_GENERATIVE_AI_API_KEY: "ficticia" }),
        createPorts,
      }),
    ).rejects.toThrow(/Groq/);
    expect(createPorts).not.toHaveBeenCalled();
  });

  it("habilitada, usa los servicios reales y arma el registro (con dobles en lugar de proveedores)", async () => {
    const { runLiveEvaluation } = await import("../../evals/ai/live");
    const ports = fakePorts(() => []);
    const record = await runLiveEvaluation({
      subset: "demo",
      repetitions: 1,
      readEnv: env({ GALCOA_EVAL_LIVE: "1", GOOGLE_GENERATIVE_AI_API_KEY: "ficticia", GROQ_API_KEY: "ficticia" }),
      createPorts: () => ({ gemini: ports.gemini, groq: ports.groq }),
    });
    expect(record.metrics.runs).toBe(12);
    expect(record.models.contrast).toEqual(["groq-doble"]);
  });
});

describe("Aislamiento de CI (MVP-123, Q6)", () => {
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it("ni npm test ni el workflow ejecutan la evaluación", () => {
    const scripts: Record<string, string> = JSON.parse(read("package.json")).scripts;
    for (const [name, cmd] of Object.entries(scripts)) {
      if (name === "eval:ai") continue;
      expect(cmd, name).not.toMatch(/evals\/|eval:ai/);
    }
    expect(read(".github/workflows/ci.yml")).not.toMatch(/eval:ai|evals\/|GALCOA_EVAL_LIVE/);
  });

  it("ningún proyecto de Vitest incluye evals/", () => {
    expect(read("vitest.config.ts")).not.toMatch(/evals/);
  });

  it("runner, métricas y reporte no importan proveedores ni la conexión real", () => {
    for (const file of ["runner.ts", "metrics.ts", "report.ts"]) {
      const imports = read(`evals/ai/${file}`)
        .split("\n")
        .filter((l) => l.startsWith("import "));
      for (const line of imports) {
        expect(line, file).not.toMatch(/@ai-sdk|groq-sdk|from "ai"|\.\/live/);
        if (line.includes("@/lib/")) expect(line, file).toMatch(/^import type /);
      }
    }
  });
});

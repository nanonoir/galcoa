import type { CaseLabel } from "./dataset/schema";
import type { CaseRun, Dataset } from "./runner";

/**
 * Cálculo determinista de métricas (MVP-123; plan F12 Q5, release-validation §4).
 *
 * Solo aritmética sobre corridas ya registradas: no llama a proveedores ni
 * juzga calidad. Los fallos técnicos se cuentan aparte y **no** entran en los
 * denominadores (un fallo no es una omisión ni un acierto).
 *
 * Correspondencia hallazgo ↔ advertencia etiquetada: comparten al menos una
 * ref de fuente (m#/e#; la ref del borrador `b1` no cuenta). Es una regla
 * mecánica y generosa: no verifica el tipo de la advertencia, así que los
 * hallazgos quedan en el registro para revisión humana.
 */

const sourceRefs = (refs: readonly string[]) => refs.filter((r) => /^[me]\d+$/.test(r));
const overlaps = (a: readonly string[], b: readonly string[]) => a.some((r) => b.includes(r));
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export type CaseScore = {
  caseId: string;
  repetition: number;
  demo: boolean;
  expectedStatus: CaseLabel["expectedControlStatus"];
  /** `null` si el contraste no produjo reporte. */
  reportedStatus: string | null;
  expectedWarnings: number;
  /** Índices de las advertencias etiquetadas que algún hallazgo cubre. */
  detected: number[];
  omitted: number[];
  /** Hallazgos que no cubren ninguna advertencia etiquetada. */
  falsePositives: number;
  /** Hechos del borrador en campos etiquetados como «no informado»: candidatos a material inventado. */
  inventedCandidates: { field: string; value: string }[];
  /** Campos «no informado» que el borrador no declaró como tales. */
  notInformedMissing: string[];
  technicalFailure: { stage: "redaccion" | "contraste"; code: string } | null;
};

export function scoreRun(run: CaseRun, label: CaseLabel): CaseScore {
  const base = {
    caseId: run.caseId,
    repetition: run.repetition,
    demo: run.demo,
    expectedStatus: label.expectedControlStatus,
    expectedWarnings: label.expectedWarnings.length,
  };
  const empty = { reportedStatus: null, detected: [], omitted: [], falsePositives: 0, inventedCandidates: [], notInformedMissing: [] };
  if (!run.drafting.ok) {
    return { ...base, ...empty, technicalFailure: { stage: "redaccion", code: run.drafting.error.code } };
  }

  const notInformed = new Set(label.notInformed.map(normalize));
  const proposal = run.drafting.proposal;
  const inventedCandidates = proposal.facts
    .filter((f) => notInformed.has(normalize(f.field)))
    .map((f) => ({ field: f.field, value: f.value }));
  const declared = new Set(proposal.notInformed.map(normalize));
  const notInformedMissing = label.notInformed.filter((f) => !declared.has(normalize(f)));

  if (!run.contrast || !run.contrast.ok) {
    return {
      ...base,
      ...empty,
      inventedCandidates,
      notInformedMissing,
      technicalFailure: { stage: "contraste", code: run.contrast?.ok === false ? run.contrast.error.code : "SIN_CONTRASTE" },
    };
  }

  const findings = run.contrast.findings.map((f) => sourceRefs(f.sourceRefs));
  const detected: number[] = [];
  const omitted: number[] = [];
  label.expectedWarnings.forEach((w, i) => (findings.some((refs) => overlaps(refs, w.sources)) ? detected : omitted).push(i));
  const falsePositives = findings.filter((refs) => !label.expectedWarnings.some((w) => overlaps(refs, w.sources))).length;

  return {
    ...base,
    reportedStatus: run.contrast.result,
    detected,
    omitted,
    falsePositives,
    inventedCandidates,
    notInformedMissing,
    technicalFailure: null,
  };
}

export type Ratio = { numerator: number; denominator: number; value: number | null };
const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  value: denominator === 0 ? null : numerator / denominator,
});

export type Metrics = {
  runs: number;
  /** Corridas con reporte de contraste: el denominador de todo lo demás. */
  evaluatedRuns: number;
  technicalFailures: { total: number; byStageAndCode: Record<string, number> };
  detection: Ratio;
  omissions: number;
  falsePositives: { total: number; runsWithAny: number; cleanCaseRunsWithFindings: Ratio };
  statusAgreement: Ratio;
  inventedCandidates: { total: number; runsWithAny: number };
  notInformedMissing: number;
  /** Casos con ≥ 2 repeticiones evaluadas cuyo estado o advertencias detectadas cambian. */
  variation: { casesCompared: number; casesWithVariation: string[] };
  /**
   * Criterio de la demo por referencia a MVP-013: 0 candidatos a material
   * inventado y 100 % de contradicciones conocidas reportadas. Es un cálculo,
   * no un veredicto (lo da el líder), y queda `incompleto` si hubo fallos.
   */
  demoCriterion: "cumple" | "no_cumple" | "incompleto" | "no_aplica";
};

export function computeMetrics(runs: readonly CaseRun[], dataset: Pick<Dataset, "labels">): { scores: CaseScore[]; metrics: Metrics } {
  const scores = runs.map((run) => {
    const label = dataset.labels.get(run.caseId);
    if (!label) throw new Error(`Corrida de un caso sin etiqueta: ${run.caseId}`);
    return scoreRun(run, label);
  });

  const evaluated = scores.filter((s) => s.technicalFailure === null);
  const failures = scores.filter((s) => s.technicalFailure !== null);
  const byStageAndCode: Record<string, number> = {};
  for (const f of failures) {
    const key = `${f.technicalFailure!.stage}:${f.technicalFailure!.code}`;
    byStageAndCode[key] = (byStageAndCode[key] ?? 0) + 1;
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const clean = evaluated.filter((s) => s.expectedWarnings === 0);

  const byCase = new Map<string, CaseScore[]>();
  for (const s of evaluated) byCase.set(s.caseId, [...(byCase.get(s.caseId) ?? []), s]);
  const compared = [...byCase.entries()].filter(([, reps]) => reps.length >= 2);
  const casesWithVariation = compared
    .filter(([, reps]) => new Set(reps.map((r) => `${r.reportedStatus}|${r.detected.join(",")}`)).size > 1)
    .map(([caseId]) => caseId);

  // Los candidatos a material inventado también cuentan si el contraste falló (la redacción sí corrió).
  const drafted = scores.filter((s) => s.technicalFailure?.stage !== "redaccion");
  const demo = scores.filter((s) => s.demo);
  let demoCriterion: Metrics["demoCriterion"] = "no_aplica";
  if (demo.length > 0) {
    if (demo.some((s) => s.technicalFailure !== null)) demoCriterion = "incompleto";
    else demoCriterion = demo.every((s) => s.omitted.length === 0 && s.inventedCandidates.length === 0) ? "cumple" : "no_cumple";
  }

  return {
    scores,
    metrics: {
      runs: scores.length,
      evaluatedRuns: evaluated.length,
      technicalFailures: { total: failures.length, byStageAndCode },
      detection: ratio(sum(evaluated.map((s) => s.detected.length)), sum(evaluated.map((s) => s.expectedWarnings))),
      omissions: sum(evaluated.map((s) => s.omitted.length)),
      falsePositives: {
        total: sum(evaluated.map((s) => s.falsePositives)),
        runsWithAny: evaluated.filter((s) => s.falsePositives > 0).length,
        cleanCaseRunsWithFindings: ratio(clean.filter((s) => s.falsePositives > 0).length, clean.length),
      },
      statusAgreement: ratio(evaluated.filter((s) => s.reportedStatus === s.expectedStatus).length, evaluated.length),
      inventedCandidates: {
        total: sum(drafted.map((s) => s.inventedCandidates.length)),
        runsWithAny: drafted.filter((s) => s.inventedCandidates.length > 0).length,
      },
      notInformedMissing: sum(drafted.map((s) => s.notInformedMissing.length)),
      variation: { casesCompared: compared.length, casesWithVariation },
      demoCriterion,
    },
  };
}

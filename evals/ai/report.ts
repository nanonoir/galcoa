import type { CaseScore, Metrics, Ratio } from "./metrics";
import type { CaseRun, Dataset } from "./runner";

/**
 * Formato de registro de una corrida (MVP-123; plan F12 Q4–Q5).
 *
 * JSON completo y tabla legible. Guarda versión y hash de las etiquetas,
 * modelos, versiones de prompt, entradas **por referencia**, salidas
 * validadas, momento y métricas con sus denominadores. Nunca incluye el texto
 * de los prompts (SH-08). Las cifras solo valen para la corrida que las
 * produjo: no son un benchmark ni una promesa de calidad.
 */

export const EVALUATION_LIMITATIONS = [
  "Datos ficticios: no dicen nada sobre fraude ni sobre documentos reales.",
  "Groq contrasta texto: en los casos con extracción depende de lo que leyó Gemini, sin verificación visual independiente.",
  "Un hallazgo cuenta como detección si comparte una fuente con la advertencia etiquetada; el tipo se revisa a mano.",
  "Los candidatos a material inventado son hechos en campos etiquetados «no informado»: requieren revisión humana.",
  "Las fechas declaradas se cargan como no informadas: la fecha está solo en el texto de cada mensaje.",
] as const;

export type EvaluationRecord = {
  formatVersion: 1;
  dataset: { version: Dataset["datasetVersion"]; labelsSha256: string; labelsFrozenAt: string };
  subset: "demo" | "all";
  repetitions: number;
  startedAt: string;
  finishedAt: string;
  models: { drafting: string[]; contrast: string[] };
  promptVersions: { drafting: string[]; contrast: string[] };
  promptsIncluded: false;
  limitations: readonly string[];
  metrics: Metrics;
  scores: CaseScore[];
  runs: CaseRun[];
};

const distinct = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();

export function buildRecord(input: {
  dataset: Pick<Dataset, "datasetVersion" | "labelsSha256" | "frozenAt">;
  subset: "demo" | "all";
  repetitions: number;
  startedAt: string;
  finishedAt: string;
  runs: CaseRun[];
  scores: CaseScore[];
  metrics: Metrics;
}): EvaluationRecord {
  const drafted = input.runs.map((r) => (r.drafting.ok ? r.drafting : undefined));
  const contrasted = input.runs.map((r) => (r.contrast?.ok ? r.contrast : undefined));
  return {
    formatVersion: 1,
    dataset: { version: input.dataset.datasetVersion, labelsSha256: input.dataset.labelsSha256, labelsFrozenAt: input.dataset.frozenAt },
    subset: input.subset,
    repetitions: input.repetitions,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    models: { drafting: distinct(drafted.map((d) => d?.modelId)), contrast: distinct(contrasted.map((c) => c?.modelId)) },
    promptVersions: {
      drafting: distinct(drafted.map((d) => d?.promptVersion)),
      contrast: distinct(contrasted.map((c) => c?.promptVersion)),
    },
    promptsIncluded: false,
    limitations: EVALUATION_LIMITATIONS,
    metrics: input.metrics,
    scores: input.scores,
    runs: input.runs,
  };
}

const fmt = (r: Ratio) => (r.value === null ? `${r.numerator}/${r.denominator} (sin denominador)` : `${r.numerator}/${r.denominator}`);

/** Tabla Markdown: resumen con denominadores y una fila por corrida. */
export function renderTable(record: EvaluationRecord): string {
  const m = record.metrics;
  const lines = [
    `# Corrida de evaluación (${record.subset}, ${record.repetitions} repetición/es)`,
    "",
    `Etiquetas ${record.dataset.version} · SHA-256 ${record.dataset.labelsSha256} · congeladas ${record.dataset.labelsFrozenAt}`,
    `Modelos: redacción ${record.models.drafting.join(", ") || "—"}; contraste ${record.models.contrast.join(", ") || "—"}`,
    `Prompts: ${[...record.promptVersions.drafting, ...record.promptVersions.contrast].join(", ") || "—"} (texto no incluido)`,
    `Inicio ${record.startedAt} · fin ${record.finishedAt}`,
    "",
    "| Métrica | Valor |",
    "| --- | --- |",
    `| Corridas evaluadas | ${m.evaluatedRuns}/${m.runs} |`,
    `| Fallos técnicos (fuera de los denominadores) | ${m.technicalFailures.total} |`,
    `| Advertencias etiquetadas detectadas | ${fmt(m.detection)} |`,
    `| Omisiones | ${m.omissions} |`,
    `| Falsos positivos (hallazgos) | ${m.falsePositives.total} |`,
    `| Casos correctos con hallazgos | ${fmt(m.falsePositives.cleanCaseRunsWithFindings)} |`,
    `| Estado igual al etiquetado | ${fmt(m.statusAgreement)} |`,
    `| Candidatos a material inventado | ${m.inventedCandidates.total} |`,
    `| Campos «no informado» no declarados | ${m.notInformedMissing} |`,
    `| Casos con variación entre repeticiones | ${m.variation.casesWithVariation.length}/${m.variation.casesCompared} |`,
    `| Criterio demo (cálculo, no veredicto) | ${m.demoCriterion} |`,
    "",
    "| Caso | Rep. | Demo | Esperado | Reportado | Detectadas | Omitidas | Falsos pos. | Inventado? | Fallo |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...record.scores.map(
      (s) =>
        `| ${s.caseId} | ${s.repetition} | ${s.demo ? "sí" : "no"} | ${s.expectedStatus} | ${s.reportedStatus ?? "—"} | ${s.detected.length}/${s.expectedWarnings} | ${s.omitted.length} | ${s.falsePositives} | ${s.inventedCandidates.length} | ${s.technicalFailure ? `${s.technicalFailure.stage}:${s.technicalFailure.code}` : "—"} |`,
    ),
    "",
    "Límites:",
    ...record.limitations.map((l) => `- ${l}`),
    "",
  ];
  return lines.join("\n");
}

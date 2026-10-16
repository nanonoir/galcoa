import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createDraftingService } from "@/lib/ai/drafting/service";
import { readGeminiConfig, type EnvReader } from "@/lib/ai/gemini/config";
import { createGeminiStructuredPort } from "@/lib/ai/gemini/structured";
import { createContrastService } from "@/lib/ai/groq/contrast";
import { readGroqConfig } from "@/lib/ai/groq/config";
import { createGroqStructuredPort } from "@/lib/ai/groq/structured";

import { computeMetrics } from "./metrics";
import { buildRecord, renderTable, type EvaluationRecord } from "./report";
import { loadDataset, runEvaluation, type CaseRun, type EvalServices } from "./runner";

/**
 * Conexión real del runner (MVP-123). **No se ejecuta al importarlo** ni lo
 * llaman CI ni `npm test`: la única corrida real es la sesión final de
 * MVP-135, que la lanza el líder con la configuración del proceso.
 *
 * Exige habilitación explícita (`GALCOA_EVAL_LIVE=1`) y las dos claves de
 * servidor. Si falta algo, falla con `EvalConfigError` antes de leer el
 * dataset o crear un cliente: nunca simula resultados.
 */

export const EVAL_LIVE_ENV = "GALCOA_EVAL_LIVE";

export class EvalConfigError extends Error {
  readonly code = "EVAL_CONFIG_MISSING";
}

export type LiveOptions = {
  subset: "demo" | "all";
  repetitions: number;
  readEnv?: EnvReader;
  /** Solo para tests: reemplaza los puertos de proveedor por dobles. */
  createPorts?: () => Pick<EvalServices, "gemini" | "groq">;
  onProgress?: (run: CaseRun) => void;
};

export async function runLiveEvaluation(options: LiveOptions): Promise<EvaluationRecord> {
  const readEnv = options.readEnv ?? ((name: string) => process.env[name]);
  if (readEnv(EVAL_LIVE_ENV) !== "1") {
    throw new EvalConfigError(`Evaluación real deshabilitada: falta ${EVAL_LIVE_ENV}=1.`);
  }
  const missing = [
    readGeminiConfig(readEnv) ? null : "Gemini",
    readGroqConfig(readEnv) ? null : "Groq",
  ].filter(Boolean);
  if (missing.length > 0) {
    // Sin nombres de variables ni valores: solo qué proveedor falta.
    throw new EvalConfigError(`Falta la configuración de servidor de: ${missing.join(", ")}.`);
  }

  const dataset = loadDataset();
  const ports = options.createPorts?.() ?? {
    gemini: createGeminiStructuredPort({ readEnv }),
    groq: createGroqStructuredPort({ readEnv }),
  };
  const startedAt = new Date().toISOString();
  const runs = await runEvaluation({
    dataset,
    services: { createDraftingService, createContrastService, ...ports },
    subset: options.subset,
    repetitions: options.repetitions,
    onProgress: options.onProgress,
  });
  const { scores, metrics } = computeMetrics(runs, dataset);
  return buildRecord({
    dataset,
    subset: options.subset,
    repetitions: options.repetitions,
    startedAt,
    finishedAt: new Date().toISOString(),
    runs,
    scores,
    metrics,
  });
}

/** Guarda la corrida como JSON y tabla Markdown con el mismo nombre. */
export function writeRecord(record: EvaluationRecord, dir: string): { json: string; table: string } {
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `eval-${record.subset}-${record.startedAt.replace(/[:.]/g, "-")}`);
  writeFileSync(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  writeFileSync(`${base}.md`, renderTable(record), "utf8");
  return { json: `${base}.json`, table: `${base}.md` };
}

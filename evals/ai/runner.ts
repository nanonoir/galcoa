import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Draft, Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";
import type { ContrastReport, ContrastDeps } from "@/lib/ai/groq/contrast";
import type { DraftingDeps, GeneratedDraft } from "@/lib/ai/drafting/service";
import type { ContrastStore, SaveReportInput } from "@/lib/documents/contrast/ports";
import type { DraftStager, ExtractionReader } from "@/lib/documents/drafting/ports";
import type { SessionPort } from "@/lib/documents/ports";
import type { ServiceResult } from "@/lib/documents/result";
import type { TurnClaimRef } from "@/lib/documents/turns/ports";

import {
  CasesFileSchema,
  canonicalJson,
  LabelsFileSchema,
  LabelsLockSchema,
  type CaseLabel,
  type EvalCase,
} from "./dataset/schema";

/**
 * Runner de evaluación (MVP-123; plan F12 Q4, release-validation §4).
 *
 * Recorre el dataset congelado y pasa cada caso por el pipeline real:
 * Agente 1 (redacción, MVP-051) y Agente 2 (contraste, MVP-053). Los
 * servicios y los puertos de proveedor se **inyectan**: este módulo solo usa
 * tipos de `src/lib`, no importa proveedores ni se ejecuta al importarlo. La
 * conexión real vive en `live.ts`, que exige habilitación explícita.
 *
 * Los casos no tocan la base: cada uno corre sobre puertos en memoria
 * construidos con sus fuentes, en el orden del dataset (los servicios numeran
 * m1…, e1… por orden, así las refs del modelo coinciden con las etiquetas).
 */

export type Dataset = {
  datasetVersion: "v1";
  cases: EvalCase[];
  labels: Map<string, CaseLabel>;
  labelsSha256: string;
  frozenAt: string;
};

export class DatasetIntegrityError extends Error {
  readonly code = "EVAL_DATASET_INTEGRITY";
}

const DATASET_DIR = path.resolve(import.meta.dirname, "dataset");

/** Carga y valida el dataset; falla si las etiquetas no coinciden con su congelamiento. */
export function loadDataset(dir: string = DATASET_DIR): Dataset {
  const read = (file: string): unknown => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const casesFile = CasesFileSchema.parse(read("cases.v1.json"));
  const labelsRaw = read("labels.v1.json");
  const labelsFile = LabelsFileSchema.parse(labelsRaw);
  const lock = LabelsLockSchema.parse(read("labels.lock.json"));

  const sha = createHash("sha256").update(canonicalJson(labelsRaw)).digest("hex");
  if (sha !== lock.canonicalSha256) {
    throw new DatasetIntegrityError("labels.v1.json no coincide con labels.lock.json: no se evalúa con etiquetas alteradas.");
  }
  const labels = new Map(labelsFile.labels.map((l) => [l.caseId, l]));
  for (const c of casesFile.cases) {
    if (!labels.has(c.id)) throw new DatasetIntegrityError(`El caso ${c.id} no tiene etiqueta.`);
  }
  return { datasetVersion: "v1", cases: casesFile.cases, labels, labelsSha256: sha, frozenAt: lock.frozenAt };
}

/** Fábricas de los servicios reales (MVP-051 y MVP-053) y sus puertos de proveedor. */
export type EvalServices = {
  createDraftingService(deps: DraftingDeps): {
    generateDraft(command: { documentId: string; expectedDraftRevision: number; claim: TurnClaimRef; correlationId?: string }): Promise<
      ServiceResult<GeneratedDraft>
    >;
  };
  createContrastService(deps: ContrastDeps): {
    contrastDraft(command: { documentId: string; correlationId?: string }): Promise<ServiceResult<ContrastReport>>;
  };
  gemini: DraftingDeps["gemini"];
  groq: ContrastDeps["groq"];
};

export type CasePorts = {
  session: SessionPort;
  messages: { listMessages(documentId: string): Promise<ServiceResult<Message[]>> };
  extractions: ExtractionReader;
  stager: DraftStager;
  /** Equivale a completar el turno: convierte el staging en el borrador oficial del caso (solo en memoria). */
  publishStaged(): void;
  contrast: ContrastStore;
  /** Lo que guardaron los servicios (para inspección; nunca se escribe en la base). */
  saved: { draft: Draft | null; report: SaveReportInput | null };
};

/**
 * Puertos en memoria de un caso. Las fechas declaradas quedan `unknown`: el
 * dataset trae la fecha dentro del texto, como la escribiría un usuario.
 */
export function buildCasePorts(evalCase: EvalCase, ids: { ownerId: string; documentId: string; newId: () => string }): CasePorts {
  const saved: CasePorts["saved"] = { draft: null, report: null };
  let staged: { content: Draft["content"]; draftId: string; revision: number } | null = null;
  const messages: Message[] = evalCase.sources
    .filter((s) => s.kind === "mensaje")
    .map((s) => ({
      messageId: ids.newId(),
      documentId: ids.documentId,
      sender: "autor",
      content: s.text,
      declaredEventDate: { kind: "unknown" },
      uploadedAt: s.uploadedAt,
    }));
  const extractions = evalCase.sources.flatMap((s) =>
    s.kind === "extraccion" ? [{ extractionId: ids.newId(), origin: s.origin, text: s.text }] : [],
  );
  const own = (ownerId: string, documentId: string) => ownerId === ids.ownerId && documentId === ids.documentId;

  return {
    saved,
    session: { currentUserId: async () => ids.ownerId },
    messages: {
      async listMessages(documentId) {
        return documentId === ids.documentId
          ? { ok: true, value: messages }
          : { ok: false, error: { code: "NOT_AVAILABLE", stage: "persistencia", retryable: false, correlationId: ids.newId() } };
      },
    },
    extractions: { listExtractions: async (ownerId, documentId) => (own(ownerId, documentId) ? extractions : []) },
    stager: {
      async stageProposal(input) {
        if (!own(input.ownerId, input.documentId)) return { status: "not_available" };
        if (input.expectedDraftRevision !== (saved.draft?.draftRevision ?? 0)) return { status: "stale_draft" };
        staged = { content: input.content, draftId: saved.draft?.draftId ?? ids.newId(), revision: input.expectedDraftRevision };
        return {
          status: "staged",
          replayed: false,
          turn: {
            turnId: input.claim.turnId, documentId: ids.documentId, clientMessageId: "eval-case", attempt: input.claim.attempt,
            state: "en_curso", userMessageId: null, agentMessageId: null, leaseExpiresAt: new Date().toISOString(),
          },
          staged: { proposalId: ids.newId(), draftId: staged.draftId, expectedDraftRevision: staged.revision, nextDraftRevision: staged.revision + 1 },
        };
      },
    },
    publishStaged() {
      if (!staged) return;
      saved.draft = {
        draftId: staged.draftId,
        documentId: ids.documentId,
        draftRevision: staged.revision + 1,
        content: staged.content,
        updatedAt: new Date().toISOString(),
      };
      staged = null;
    },
    contrast: {
      getCurrentDraft: async (ownerId, documentId) => (own(ownerId, documentId) ? saved.draft : null),
      async saveReport(input) {
        saved.report = input;
        return { reportId: ids.newId(), createdAt: new Date().toISOString() };
      },
    },
  };
}

export type StageError = Pick<TechnicalError, "code" | "stage" | "retryable">;

/** Una corrida de un caso: salidas validadas o el fallo técnico, nunca ambos. */
export type CaseRun = {
  caseId: string;
  repetition: number;
  demo: boolean;
  startedAt: string;
  drafting:
    | { ok: true; attempts: number; modelId: string; promptVersion: string; inputs: string[]; proposal: GeneratedDraft["proposal"] }
    | { ok: false; attempts: number; error: StageError };
  contrast:
    | {
        ok: true;
        attempts: number;
        modelId: string;
        promptVersion: string;
        inputs: string[];
        result: ContrastReport["result"];
        findings: ContrastReport["findings"];
        limitations: string[];
      }
    | { ok: false; attempts: number; error: StageError }
    | null;
};

export type RunOptions = {
  dataset: Dataset;
  services: EvalServices;
  /** Repeticiones por caso: se acuerdan con el líder (no constan en MVP-013). */
  repetitions: number;
  /** `demo` = los 12 casos marcados; `all` = los 30. */
  subset: "demo" | "all";
  newId?: () => string;
  now?: () => Date;
  onProgress?: (run: CaseRun) => void;
};

/** Un solo reintento, y solo si el error es transitorio (MVP-013 §7.3: lo decide el llamador). */
async function withOneRetry<T>(call: () => Promise<ServiceResult<T>>): Promise<{ result: ServiceResult<T>; attempts: number }> {
  const first = await call();
  if (first.ok || !first.error.retryable) return { result: first, attempts: 1 };
  return { result: await call(), attempts: 2 };
}

const stageError = (e: TechnicalError): StageError => ({ code: e.code, stage: e.stage, retryable: e.retryable });

export async function runEvaluation(options: RunOptions): Promise<CaseRun[]> {
  const { dataset, services, repetitions, subset } = options;
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new RangeError("repetitions debe ser un entero ≥ 1");
  const newId = options.newId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const cases = subset === "demo" ? dataset.cases.filter((c) => c.demo) : dataset.cases;

  const runs: CaseRun[] = [];
  for (const evalCase of cases) {
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      const ids = { ownerId: newId(), documentId: newId(), newId };
      const ports = buildCasePorts(evalCase, ids);
      const startedAt = now().toISOString();

      const drafting = services.createDraftingService({
        session: ports.session,
        messages: ports.messages,
        stager: ports.stager,
        gemini: services.gemini,
        extractions: ports.extractions,
      });
      const drafted = await withOneRetry(() =>
        drafting.generateDraft({
          documentId: ids.documentId,
          expectedDraftRevision: ports.saved.draft?.draftRevision ?? 0,
          claim: { turnId: ids.newId(), attempt: 1 },
        }),
      );

      let run: CaseRun;
      if (!drafted.result.ok) {
        run = {
          caseId: evalCase.id,
          repetition,
          demo: evalCase.demo,
          startedAt,
          drafting: { ok: false, attempts: drafted.attempts, error: stageError(drafted.result.error) },
          contrast: null,
        };
      } else {
        const d = drafted.result.value;
        ports.publishStaged();
        const contrast = services.createContrastService({
          session: ports.session,
          messages: ports.messages,
          store: ports.contrast,
          groq: services.groq,
          extractions: ports.extractions,
        });
        const contrasted = await withOneRetry(() => contrast.contrastDraft({ documentId: ids.documentId }));
        run = {
          caseId: evalCase.id,
          repetition,
          demo: evalCase.demo,
          startedAt,
          drafting: {
            ok: true,
            attempts: drafted.attempts,
            modelId: d.modelId,
            promptVersion: d.promptVersion,
            inputs: d.inputs.map((i) => i.ref),
            proposal: d.proposal,
          },
          contrast: contrasted.result.ok
            ? {
                ok: true,
                attempts: contrasted.attempts,
                modelId: contrasted.result.value.modelId,
                promptVersion: contrasted.result.value.promptVersion,
                inputs: contrasted.result.value.inputs.map((i) => i.ref),
                result: contrasted.result.value.result,
                findings: contrasted.result.value.findings,
                limitations: contrasted.result.value.limitations,
              }
            : { ok: false, attempts: contrasted.attempts, error: stageError(contrasted.result.error) },
        };
      }
      runs.push(run);
      options.onProgress?.(run);
    }
  }
  return runs;
}

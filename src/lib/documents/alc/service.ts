import "server-only";

import type { AlcFactsResult } from "@/lib/ai/alc/facts";
import {
  ALC_OUTCOME,
  ALC_RULE,
  ALC_RULES_VERSION,
  ALC_TECHNICAL,
  type AlcClaim,
  type AlcResult,
  type AlcSource,
  type AlcTechnical,
} from "@/lib/contracts/alc";
import type { AlcShared, Rectification } from "@/lib/contracts/review";
import type { TechnicalError } from "@/lib/contracts/technical";
import { evaluateAlc } from "@/lib/rules/alc";

import { canonicalHash } from "../manifest/jcs";
import { failure, newId } from "../result";

import { buildInventory, type InventoryInput, type SourceBacking } from "./inventory";
import { applyRectifications, type RectificationRequest } from "./rectify";

/**
 * Evaluación ALC del servidor (F-1/F-4). Une inventario → hechos (IA con citas) → rectificaciones → evaluación pura →
 * persistencia por la RPC del ejecutor. El color nunca sale de la IA ni del llamador: lo calcula `evaluateAlc` y la base
 * lo recomprueba contra los hallazgos. Un fallo técnico NO es un rojo: se informa como error de etapa y no se persiste.
 */

export type AlcSaveInput = {
  ownerId: string;
  documentId: string;
  draftRevision: number;
  selection: string[];
  rulesVersion: string;
  input: Record<string, unknown>;
  inputHash: string;
  color: string;
  result: Record<string, unknown>;
  shared: AlcShared;
  rectifications: Rectification[];
  sourceAliases: { alias: string; kind: "mensaje" | "evidencia"; id: string }[];
  inventory: { messages: string[]; evidences: string[]; extractions: string[] };
  correlationId: string;
};

export type AlcSaveResult =
  | { status: "saved"; evaluationId: string }
  | { status: "stale_draft" | "selection_invalid" | "inventory_mismatch" | "result_inconsistent" | "not_available" };

export type AlcStore = { save(input: AlcSaveInput): Promise<AlcSaveResult> };

export type AlcSourceReader = { read(ownerId: string, documentId: string): Promise<InventoryInput> };

export type AlcFactsPort = {
  readFacts(input: {
    draft: { title: string; body: string };
    sources: readonly AlcSource[];
    correlationId: string;
    abortSignal?: AbortSignal;
  }): Promise<AlcFactsResult>;
};

export type AlcEvaluation = {
  evaluationId: string;
  color: "verde" | "amarillo" | "rojo";
  shared: AlcShared;
  rectifications: Rectification[];
  selection: string[];
  /** Alias `ALC-n` → fuente persistida real, para `snapshot_sources`. */
  sourceAliases: { alias: string; kind: "mensaje" | "evidencia"; id: string }[];
};

export type AlcEvaluateInput = {
  ownerId: string;
  documentId: string;
  draft: { revision: number; title: string; body: string };
  selection: readonly string[];
  rectifications?: readonly RectificationRequest[];
  correlationId?: string;
  abortSignal?: AbortSignal;
};

const RETRYABLE_TECHNICAL: ReadonlySet<AlcTechnical> = new Set([
  ALC_TECHNICAL.READING, ALC_TECHNICAL.CLAIM, ALC_TECHNICAL.CITATION, ALC_TECHNICAL.INVENTORY,
]);

type EvaluatedOk = Extract<AlcResult, { status: typeof ALC_OUTCOME.EVALUATED }>;

/** Resumen compartible: alias locales `ALC-n`, sin ids ni rutas privadas. */
export function buildShared(
  result: EvaluatedOk,
  claims: readonly AlcClaim[],
  inputHash: string,
  extraSourceIds: readonly string[],
): { shared: AlcShared; aliasOf: Map<string, string> } {
  const ids = new Set<string>(extraSourceIds);
  for (const finding of result.findings) finding.sourceIds.forEach((id) => ids.add(id));
  for (const claim of claims) claim.assertions.forEach((a) => ids.add(a.citation.sourceId));
  const aliasOf = new Map([...ids].sort().map((id, i) => [id, `ALC-${i + 1}`] as const));
  const status = (claim: AlcClaim): AlcShared["claims"][number]["status"] => {
    const own = result.findings.filter((f) => f.claimId === claim.id).map((f) => f.ruleId);
    if (own.includes(ALC_RULE.CONTRADICTION)) return "contradicho";
    if (own.includes(ALC_RULE.AMBIGUITY)) return "ambiguo";
    return own.includes(ALC_RULE.MATCHING) ? "confirmado" : "declarado";
  };
  return {
    aliasOf,
    shared: {
      rulesVersion: result.rulesVersion,
      color: result.color,
      inputHash,
      findings: result.findings.map((f) => ({ ruleId: f.ruleId, claimId: f.claimId, sources: f.sourceIds.map((id) => aliasOf.get(id)!) })),
      claims: claims.map((c) => ({ id: c.id, subject: c.subject, field: c.field, value: c.value, unit: c.unit, status: status(c) })),
    },
  };
}

export function createAlcEvaluator(deps: { reader: AlcSourceReader; facts: AlcFactsPort; store: AlcStore }) {
  return {
    async evaluate(
      command: AlcEvaluateInput,
    ): Promise<{ ok: true; value: AlcEvaluation } | { ok: false; error: TechnicalError }> {
      const correlationId = command.correlationId ?? newId();
      const stage = "congelado" as const;
      try {
        let inventory;
        try {
          inventory = buildInventory(await deps.reader.read(command.ownerId, command.documentId));
        } catch {
          return failure(ALC_TECHNICAL.INVENTORY, stage, true, correlationId);
        }

        const read = await deps.facts.readFacts({
          draft: { title: command.draft.title, body: command.draft.body },
          sources: inventory.sources,
          correlationId,
          abortSignal: command.abortSignal,
        });
        if (!read.ok) {
          if ("error" in read) return { ok: false, error: read.error };
          return failure(read.technical, stage, RETRYABLE_TECHNICAL.has(read.technical), correlationId);
        }

        const rectified = applyRectifications(read.facts.claims, command.rectifications ?? [], inventory.sources);
        const input = {
          documentId: command.documentId,
          draftRevision: command.draft.revision,
          selection: [...command.selection],
          inventoryComplete: true,
          contentCoverageComplete: read.facts.contentCoverageComplete,
          sources: inventory.sources,
          claims: rectified.claims,
        };
        const result = evaluateAlc(input);
        if (result.status !== ALC_OUTCOME.EVALUATED) {
          return failure(result.code, stage, RETRYABLE_TECHNICAL.has(result.code), correlationId);
        }

        const inputHash = canonicalHash(input).hash;
        const touched = rectified.applied.flatMap((r) => [...r.originalSourceIds, ...r.correctedSourceIds]);
        const { shared, aliasOf } = buildShared(result, rectified.claims, inputHash, touched);
        const rectifications: Rectification[] = rectified.applied.map((r) => ({
          claimId: r.claimId,
          previousValue: r.previousValue,
          correctedValue: r.correctedValue,
          reason: r.reason,
          originalSources: r.originalSourceIds.map((id) => aliasOf.get(id)!),
          correctedSources: r.correctedSourceIds.map((id) => aliasOf.get(id)!),
        }));
        const sourceAliases = [...aliasOf].map(([id, alias]) => {
          const backing: SourceBacking | undefined = inventory.backing[id];
          if (!backing) throw new Error("Fuente sin respaldo persistido");
          return { alias, ...backing };
        });

        const saved = await deps.store.save({
          ownerId: command.ownerId,
          documentId: command.documentId,
          draftRevision: command.draft.revision,
          selection: [...command.selection],
          rulesVersion: ALC_RULES_VERSION,
          input,
          inputHash,
          color: result.color,
          result,
          shared,
          rectifications,
          sourceAliases,
          inventory: inventory.inventory,
          correlationId,
        });
        switch (saved.status) {
          case "saved":
            return {
              ok: true,
              value: { evaluationId: saved.evaluationId, color: result.color, shared, rectifications, selection: [...command.selection], sourceAliases },
            };
          case "stale_draft":
            return failure("STALE_DRAFT", stage, false, correlationId);
          case "inventory_mismatch":
            return failure(ALC_TECHNICAL.INVENTORY, stage, true, correlationId);
          case "selection_invalid":
            return failure("INVALID_INPUT", "validacion", false, correlationId);
          case "result_inconsistent":
            return failure("ALC_RESULT_INCONSISTENT", stage, false, correlationId);
          default:
            return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        }
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}

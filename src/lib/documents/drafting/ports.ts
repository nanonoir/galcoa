import "server-only";

import type { Draft } from "@/lib/contracts/core";

import type { AuditContext } from "../ports";
import type { TurnClaimRef, TurnRecord } from "../turns/ports";

/** Staging de propuestas del Agente 1 (MVP-051/052); el adaptador SQL es `DurableChatStore`. */

export type DraftInputRef = {
  /** Ref enviada al modelo (m1, e1…). */
  ref: string;
  kind: "mensaje" | "extraccion";
  /** Id persistido del mensaje o de la extracción. */
  id: string;
};

export type SaveProposalInput = {
  ownerId: string;
  documentId: string;
  /** Concurrencia optimista (SH-01): se compara al completar el turno. */
  expectedDraftRevision: number;
  content: Draft["content"];
  /** Salida estructurada validada y verificada (hechos, correcciones, advertencias). */
  proposal: unknown;
  /** Entradas exactas y en orden (INV-07). */
  inputs: DraftInputRef[];
  modelId: string;
  promptVersion: string;
  limitations: string[];
};

export type StagedRef = { proposalId: string; draftId: string; expectedDraftRevision: number; nextDraftRevision: number };

export type StageProposalInput = SaveProposalInput & { claim: TurnClaimRef; audit: AuditContext };

export type StageProposalResult =
  | { status: "staged"; replayed: boolean; turn: TurnRecord; staged: StagedRef }
  | { status: "stale" | "user_message_required" | "stage_conflict" | "stale_draft" | "not_available" };

/**
 * Prepara la propuesta ligada a un intento (`TurnClaimRef`) sin tocar el borrador
 * oficial ni crear mensajes: solo completar el turno publica (docs/design/durable-chat-turns.md).
 * Devuelve referencias de staging, nunca un `Draft`.
 */
export type DraftStager = {
  stageProposal(input: StageProposalInput): Promise<StageProposalResult>;
};

/** Extracciones persistidas de evidencias (MVP-043, opcional hasta que exista). */
export type ExtractionReader = {
  listExtractions(
    ownerId: string,
    documentId: string,
  ): Promise<{ extractionId: string; origin: "pdf" | "imagen"; text: string }[]>;
};

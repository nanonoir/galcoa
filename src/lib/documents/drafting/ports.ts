import "server-only";

import type { Draft } from "@/lib/contracts/core";

/**
 * Persistencia de propuestas del Agente 1 (MVP-051; RPC `save_draft` de
 * docs/design/data-transactions.md, migración aditiva pendiente con F4).
 * Solo existe el puerto; el adaptador Supabase depende de MVP-025.
 */

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
  /** Concurrencia optimista (SH-01): si la base tiene otra revisión, conflicto. */
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

export type SaveProposalResult =
  | { status: "created"; draft: Draft; proposalId: string }
  | { status: "stale_draft" }
  | { status: "not_available" };

/**
 * Cada guardado crea una propuesta nueva (no sobrescribe las anteriores) y
 * avanza `draftRevision`. El tiempo es el del servidor de base. No toca
 * mensajes ni revisiones congeladas.
 */
export type DraftStore = {
  saveProposal(input: SaveProposalInput): Promise<SaveProposalResult>;
};

/** Extracciones persistidas de evidencias (MVP-043, opcional hasta que exista). */
export type ExtractionReader = {
  listExtractions(
    ownerId: string,
    documentId: string,
  ): Promise<{ extractionId: string; origin: "pdf" | "imagen"; text: string }[]>;
};

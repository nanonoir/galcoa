import "server-only";

import type { Draft } from "@/lib/contracts/core";

/**
 * Persistencia de reportes del Agente 2 (MVP-053). Solo existe el puerto; el
 * adaptador Supabase depende de MVP-025 y de la migración aditiva de F4.
 */

export type ContrastInputRef = {
  ref: string;
  kind: "mensaje" | "extraccion" | "borrador";
  id: string;
};

export type SaveReportInput = {
  ownerId: string;
  documentId: string;
  draftId: string;
  /** Revisión exacta del borrador evaluado. */
  draftRevision: number;
  /** Contenido exacto de `b1` evaluado; SQL lo compara con el borrador vigente (no se relee tras generar). */
  draftContent: Draft["content"];
  correlationId: string;
  result: "sin_inconsistencias_criticas_detectadas" | "con_advertencias" | "contradiccion_critica";
  findings: { message: string; severity: "warning" | "critical"; sourceRefs: string[] }[];
  /** Entradas exactas enviadas, en orden (INV-07). Ninguna se omite: un exceso se rechaza antes. */
  inputs: ContrastInputRef[];
  modelId: string;
  promptVersion: string;
  limitations: string[];
};

/** `stale_draft`: el borrador cambió (id, revisión o contenido) tras la lectura; nada se escribió. */
export type SaveReportResult =
  | { status: "created"; reportId: string; createdAt: string }
  | { status: "stale_draft" }
  | { status: "not_available" };

/**
 * Cada guardado crea un reporte nuevo e inmutable; nunca sobrescribe otro ni
 * cambia otras dimensiones del documento (el reporte es informativo, INV-02).
 */
export type ContrastStore = {
  /** Borrador vigente del propietario; `null` si no existe o es ajeno. */
  getCurrentDraft(ownerId: string, documentId: string): Promise<Draft | null>;
  saveReport(input: SaveReportInput): Promise<SaveReportResult>;
};

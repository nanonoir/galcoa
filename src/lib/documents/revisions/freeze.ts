import "server-only";

import { FrozenOperationSchema, ParticipantSelectionSchema, type FrozenOperation, type ParticipantSelection } from "@/lib/contracts/review";
import type { OperationContent } from "@/lib/contracts/core";
import { projectSharedWarnings, type ConsolidatedWarning } from "@/lib/rules/consolidate";

import { snapshotHash } from "../manifest/manifest";

/**
 * Congelado puro del snapshot (MVP-070; PRD §5, INV-11/14; SH-02).
 *
 * Arma el contenido compartible desde el borrador vigente y las advertencias
 * consolidadas, normaliza la selección (siempre con el autor, en orden
 * canónico) y calcula el hash con JCS. La tabla alias → ref privada vuelve
 * aparte y **nunca** forma parte del contenido congelado. Una advertencia,
 * aun crítica, no impide congelar.
 */

const CANONICAL_ORDER = ["autor", "intermediario", "comprador"] as const;

/** Selección canónica: deduplicada, con el autor y en orden fijo; `null` si hay un rol desconocido. */
export function normalizeSelection(input: readonly string[]): ParticipantSelection | null {
  const wanted = new Set<string>(["autor", ...input]);
  const ordered = CANONICAL_ORDER.filter((role) => wanted.has(role));
  if (ordered.length !== wanted.size) return null;
  const parsed = ParticipantSelectionSchema.safeParse(ordered);
  return parsed.success ? parsed.data : null;
}

export type FreezeInput = {
  content: OperationContent;
  warnings: readonly ConsolidatedWarning[];
  /** Descripción compartible de una fuente privada (sin ids, rutas ni nombres de archivo). */
  describeSource: (ref: string) => string;
  selection: ParticipantSelection;
};

export type FrozenSnapshot = {
  content: FrozenOperation;
  snapshotHash: string;
  /** Alias → ref privada: solo para el propietario, nunca en el DTO. */
  aliasTable: { alias: string; ref: string }[];
};

export function buildFrozenSnapshot(input: FreezeInput): FrozenSnapshot {
  const { shared, aliasTable } = projectSharedWarnings(input.warnings, input.describeSource);
  const content = FrozenOperationSchema.parse({
    operation: { title: input.content.title, body: input.content.body, corrections: input.content.corrections },
    warnings: shared,
    selection: input.selection,
  });
  return { content, snapshotHash: snapshotHash(content).hash, aliasTable };
}

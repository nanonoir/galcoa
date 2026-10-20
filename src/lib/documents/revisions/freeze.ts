import "server-only";

import { FrozenOperationV2Schema, type AlcSelection, type FrozenOperationV2 } from "@/lib/contracts/review";
import type { OperationContent } from "@/lib/contracts/core";
import { projectSharedWarnings, type ConsolidatedWarning } from "@/lib/rules/consolidate";

import type { AlcEvaluation } from "../alc/service";
import { snapshotHash } from "../manifest/manifest";

/**
 * Congelado puro del snapshot v2 (MVP-070; PRD 5, INV-11/14; SH-02; F-2).
 *
 * Arma el contenido compartible desde el borrador vigente, las advertencias consolidadas y la evaluación ALC ya
 * persistida, normaliza la selección y calcula el hash con JCS. La tabla alias → ref privada vuelve aparte y
 * **nunca** forma parte del contenido congelado. El color viene de la evaluación, no del llamador.
 */

/**
 * Selección de escritura nueva: el proveedor (`autor`) y el comprador son obligatorios; el transportista
 * (`intermediario`) es opcional. Devuelve `null` si falta el comprador o hay un rol desconocido. El orden es fijo.
 */
export function normalizeSelection(input: readonly string[]): AlcSelection | null {
  const wanted = new Set<string>(["autor", ...input]);
  if (![...wanted].every((role) => role === "autor" || role === "intermediario" || role === "comprador")) return null;
  if (!wanted.has("comprador")) return null;
  return wanted.has("intermediario") ? ["autor", "intermediario", "comprador"] : ["autor", "comprador"];
}

export type FreezeInput = {
  content: OperationContent;
  warnings: readonly ConsolidatedWarning[];
  /** Descripción compartible de una fuente privada (sin ids, rutas ni nombres de archivo). */
  describeSource: (ref: string) => string;
  evaluation: AlcEvaluation;
};

export type FrozenSnapshot = {
  content: FrozenOperationV2;
  snapshotHash: string;
  /** Bytes JCS del contenido en hexadecimal: la base los vuelve a hashear y los compara. */
  canonicalHex: string;
  /** Alias → ref privada de las advertencias heredadas: solo para el propietario, nunca en el DTO. */
  aliasTable: { alias: string; ref: string }[];
};

export function buildFrozenSnapshot(input: FreezeInput): FrozenSnapshot {
  const { shared, aliasTable } = projectSharedWarnings(input.warnings, input.describeSource);
  const content = FrozenOperationV2Schema.parse({
    operation: { title: input.content.title, body: input.content.body, corrections: input.content.corrections },
    warnings: shared,
    selection: input.evaluation.selection,
    alc: input.evaluation.shared,
    rectifications: input.evaluation.rectifications,
  });
  const canonical = snapshotHash(content);
  return { content, snapshotHash: canonical.hash, canonicalHex: Buffer.from(canonical.bytes).toString("hex"), aliasTable };
}

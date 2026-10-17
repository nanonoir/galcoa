import "server-only";

import { z } from "zod";

import { DraftSchema } from "@/lib/contracts/core";
import { ControlStatusSchema } from "@/lib/contracts/document";
import { controlStatus } from "@/lib/rules/dimensions";
import { consolidateWarnings, ruleWarnings, type WarningInput } from "@/lib/rules/consolidate";
import { evaluateRepeatedValues, type SeriesSource } from "@/lib/rules/repeated-values";

import type { FreezeSource } from "./ports";

/**
 * Lectura congelada: une las advertencias del Agente 1 (redacción) y del Agente 2
 * (contraste) del borrador vigente. La base ya eligió, por separado, el reporte de
 * cada tipo que corresponde a ese borrador exacto (`get_freeze_source`, migración
 * 02503); aquí solo se validan y se unifican.
 *
 * Cada reporte numera sus refs (`m1`, `e1`…) por su cuenta, así que dos reportes
 * pueden usar el mismo ref para fuentes distintas. Se unifican por **fuente real**
 * (tipo + id): una misma fuente conserva un único ref y una fuente distinta nunca
 * hereda el de otra. De las reglas deterministas solo corre `valores_repetidos`
 * (umbral 4, decisión de producto de MVP-013) sobre `ruleSources`; los demás
 * indicadores están descartados. Sin datos suficientes `rulesEvaluated` queda falso.
 */

const RefSchema = z.string().regex(/^[me]\d{1,3}$/);
const RawRefs = z.array(z.strictObject({ ref: z.string(), kind: z.enum(["mensaje", "evidencia"]), id: z.string().nullable() }));
const Finding = z.strictObject({ message: z.string().min(1), severity: z.enum(["warning", "critical"]), sourceRefs: z.array(z.string()) });

export const FreezeSourceSchema = z.strictObject({
  draft: DraftSchema,
  /** Contraste vigente del borrador exacto (o histórico sin `kind`). */
  report: z.strictObject({ result: ControlStatusSchema.exclude(["sin_evaluar"]), findings: z.array(Finding) }).nullable(),
  refs: RawRefs,
  /** Redacción publicada del borrador vigente. */
  agent1: z.strictObject({ warnings: z.array(Finding.extend({ sourceRefs: z.array(RefSchema).min(1) })), refs: RawRefs }).nullable(),
});

export type RawFreezeSource = z.infer<typeof FreezeSourceSchema>;

export function toFreezeSource(source: RawFreezeSource, ruleSources: readonly SeriesSource[] = []): FreezeSource {
  const sourceRefs: FreezeSource["sourceRefs"] = {};
  const sourceDescriptions: Record<string, string> = {};
  const canonicalByKey = new Map<string, string>();

  const nextRef = (kind: "mensaje" | "evidencia") => {
    const prefix = kind === "mensaje" ? "m" : "e";
    let n = 1;
    while (`${prefix}${n}` in sourceRefs) n++;
    return `${prefix}${n}`;
  };

  /** Registra las fuentes de un reporte y devuelve su ref propio → ref unificado. */
  const register = (entries: RawFreezeSource["refs"]): Map<string, string> => {
    const local = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.id) continue;
      const key = `${entry.kind}:${entry.id}`;
      let canonical = canonicalByKey.get(key);
      if (!canonical) {
        const own = entry.ref.startsWith(entry.kind === "mensaje" ? "m" : "e") && /^[me]\d+$/.test(entry.ref) && !(entry.ref in sourceRefs);
        canonical = own ? entry.ref : nextRef(entry.kind);
        canonicalByKey.set(key, canonical);
        sourceRefs[canonical] = { kind: entry.kind, id: entry.id };
        // Descripción compartible genérica: sin nombres de archivo, rutas ni contenido privado.
        sourceDescriptions[canonical] = entry.kind === "mensaje" ? "mensaje del chat" : "evidencia aportada";
      }
      local.set(entry.ref, canonical);
    }
    return local;
  };

  const revision = source.draft.draftRevision;
  const inputs: WarningInput[] = [];
  const collect = (origin: "agente1" | "agente2", local: Map<string, string>, findings: readonly z.infer<typeof Finding>[]) => {
    for (const finding of findings) {
      inputs.push({
        origin,
        draftRevision: revision,
        code: null,
        // Una mención «(m1)» en el texto sigue a su fuente real; si no se pudo resolver, no queda un ref huérfano.
        message: finding.message.replace(/\(([me]\d+)\)/g, (_, ref: string) => (local.has(ref) ? `(${local.get(ref)})` : "(fuente no identificada)")),
        severity: finding.severity,
        sources: [...new Set(finding.sourceRefs.flatMap((ref) => local.get(ref) ?? []))],
      });
    }
  };

  // El contraste se registra primero: conserva sus refs históricos.
  if (source.report) collect("agente2", register(source.refs), source.report.findings);
  if (source.agent1) collect("agente1", register(source.agent1.refs), source.agent1.warnings);

  // Reglas: solo `valores_repetidos` (umbral 4, decisión de producto 2026-10-17). Sin datos suficientes no corre.
  const rules = evaluateRepeatedValues(ruleSources);
  for (const { source: found, finding } of rules.signals) {
    const key = `${found.kind}:${found.id}`;
    const canonical = register([{ ref: key, kind: found.kind, id: found.id }]).get(key);
    if (canonical) inputs.push(...ruleWarnings([{ ...finding, sources: [canonical] }], revision));
  }

  const warnings = consolidateWarnings(inputs, revision).current;
  return {
    draft: source.draft,
    warnings,
    sourceDescriptions,
    sourceRefs,
    controlStatus: controlStatus({
      draftRevision: revision,
      agent2: source.report ? { draftRevision: revision, result: source.report.result } : null,
      findings: warnings.map((w) => ({ severity: w.severity, draftRevision: w.draftRevision })),
      rulesEvaluated: rules.evaluated,
    }),
  };
}

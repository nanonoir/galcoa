import "server-only";

import type { DraftModelWarning, DraftOutput } from "./schema";

/**
 * Verificación determinista de procedencia (MVP-051, plan F5 §5; criterio
 * propuesto, a confirmar con el líder):
 * - Una ref que no está en la entrada autorizada invalida la salida (error
 *   técnico), nunca se descarta en silencio.
 * - Una corrección cuyo original no está en su fuente, o que cambia números,
 *   no es inocua: invalida la salida.
 * - Un hecho cuya cita no está en su fuente, o cuyos números no aparecen en la
 *   cita, se conserva y se marca «sin respaldo textual» como advertencia.
 */

const normalize = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const digits = (s: string): string[] => s.match(/\d+(?:[.,]\d+)*/g) ?? [];

export type ProvenanceResult =
  | { ok: true; addedWarnings: DraftModelWarning[] }
  | { ok: false; reason: "unknown_source" | "non_innocuous_correction" };

export function checkProvenance(output: DraftOutput, sources: ReadonlyMap<string, string>): ProvenanceResult {
  const refs = [
    ...output.facts.map((f) => f.sourceRef),
    ...output.corrections.map((c) => c.sourceRef),
    ...output.warnings.flatMap((w) => w.sourceRefs),
  ];
  if (refs.some((r) => !sources.has(r))) return { ok: false, reason: "unknown_source" };

  for (const c of output.corrections) {
    const source = normalize(sources.get(c.sourceRef)!);
    const sameNumbers = digits(c.original).join("|") === digits(c.corrected).join("|");
    if (!source.includes(normalize(c.original)) || !sameNumbers) {
      return { ok: false, reason: "non_innocuous_correction" };
    }
  }

  const addedWarnings: DraftModelWarning[] = [];
  for (const f of output.facts) {
    const quote = normalize(f.quote);
    const inSource = normalize(sources.get(f.sourceRef)!).includes(quote);
    const numbersBacked = digits(f.value).every((d) => digits(f.quote).includes(d));
    if (!inSource || !numbersBacked) {
      addedWarnings.push({
        message: `Sin respaldo textual: «${f.field}: ${f.value}» no coincide con una cita de ${f.sourceRef}.`,
        severity: "warning",
        sourceRefs: [f.sourceRef],
      });
    }
  }
  return { ok: true, addedWarnings };
}

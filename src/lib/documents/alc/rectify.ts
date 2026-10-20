import "server-only";

import { ALC_SOURCE_KIND, type AlcClaim, type AlcSource } from "@/lib/contracts/alc";

/**
 * Rectificación trazable (F-4). Una corrección solo sustituye una afirmación previa si (1) trae motivo, (2) el borrador
 * ya dice el valor corregido y (3) una fuente probatoria legible respalda ese valor. Las afirmaciones reemplazadas se
 * excluyen de la evaluación pero **se conservan** en el registro (valor y fuentes originales). Nunca se borra una
 * afirmación probatoria ni se «aprueba igual»: lo que no cumple queda como estaba y el rojo se mantiene. La revisión
 * resultante es nueva y no hereda confirmaciones (lo garantiza el congelado).
 */

export type RectificationRequest = { claimId: string; previousValue: string; correctedValue: string; reason: string };

export type AppliedRectification = RectificationRequest & { originalSourceIds: string[]; correctedSourceIds: string[] };

export function applyRectifications(
  claims: readonly AlcClaim[],
  requests: readonly RectificationRequest[],
  sources: readonly AlcSource[],
): { claims: AlcClaim[]; applied: AppliedRectification[] } {
  const kindOf = new Map(sources.map((s) => [s.id, s]));
  const applied: AppliedRectification[] = [];
  const out = claims.map((claim) => {
    const request = requests.find((r) => r.claimId === claim.id);
    const reason = request?.reason.trim() ?? "";
    if (!request || !reason || claim.value !== request.correctedValue.trim()) return claim;
    const previous = request.previousValue.trim();
    const probative = claim.assertions.filter((a) => {
      const s = kindOf.get(a.citation.sourceId);
      return s?.kind === ALC_SOURCE_KIND.EVIDENCE && s.reading === "legible" && a.value === claim.value;
    });
    const superseded = claim.assertions.filter(
      (a) => kindOf.get(a.citation.sourceId)?.kind === ALC_SOURCE_KIND.MESSAGE && a.value === previous && previous !== claim.value,
    );
    if (probative.length === 0 || superseded.length === 0) return claim;
    applied.push({
      claimId: claim.id,
      previousValue: previous,
      correctedValue: claim.value,
      reason,
      originalSourceIds: [...new Set(superseded.map((a) => a.citation.sourceId))].sort(),
      correctedSourceIds: [...new Set(probative.map((a) => a.citation.sourceId))].sort(),
    });
    return { ...claim, assertions: claim.assertions.filter((a) => !superseded.includes(a)) };
  });
  return { claims: out, applied };
}

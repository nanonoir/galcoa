import { ACTIVATION_STEPS, ActivationChecklistSchema, type ActivationChecklist } from "@/lib/contracts/conversion";
import type { DocumentSummary } from "@/lib/contracts/document";

/**
 * Checklist de activación derivado de los documentos reales del usuario
 * (conversion-funnel.md, D4). Puro: no agrega estado de producto.
 *
 * El avance es el de UNA operación (un documento), nunca una combinación de
 * documentos distintos: un documento con confirmaciones y otro con sello no
 * suman pasos entre sí. Se toma el documento más avanzado (a igual avance, el
 * más reciente) y sus pasos se cumplen en orden:
 * - creado: existe el documento.
 * - verificado: pasó del borrador (revisión congelada, control evaluado o estado avanzado).
 * - confirmado: la revisión tiene todas las confirmaciones (o el documento ya está finalizado).
 * - sellado: la huella quedó registrada en Hedera.
 * Con una operación sellada la guía está completa y no propone seguir ninguna.
 */

/** Pasos cumplidos por un documento; cada paso exige el anterior. */
function completedSteps(d: DocumentSummary): number {
  // Un borrador con contradicción crítica (control histórico del resumen, no el ALC autoritativo)
  // no está listo para pedir confirmación: sigue en «verificado» hasta aclarar la diferencia.
  const blockedDraft = d.documentStatus === "borrador" && d.controlStatus === "contradiccion_critica";
  const verified = !blockedDraft && (d.revisionId !== null || d.controlStatus !== "sin_evaluar" || d.documentStatus !== "borrador");
  if (!verified) return 1;
  const confirmed = d.confirmationStatus === "completa" || d.documentStatus === "finalizado";
  if (!confirmed) return 2;
  return d.hcsStatus === "registrado" ? 4 : 3;
}

function isMoreAdvanced(a: { document: DocumentSummary; steps: number }, b: { document: DocumentSummary; steps: number }): boolean {
  return a.steps !== b.steps ? a.steps > b.steps : a.document.updatedAt > b.document.updatedAt;
}

export function toActivationChecklist(documents: readonly DocumentSummary[]): ActivationChecklist {
  let best: { document: DocumentSummary; steps: number } | null = null;
  for (const document of documents) {
    const candidate = { document, steps: completedSteps(document) };
    if (!best || isMoreAdvanced(candidate, best)) best = candidate;
  }
  const completed = best?.steps ?? 0;
  return ActivationChecklistSchema.parse({
    steps: ACTIVATION_STEPS.map((id, index) => ({ id, done: index < completed })),
    nextDocumentId: best && completed < ACTIVATION_STEPS.length ? best.document.id : null,
  });
}

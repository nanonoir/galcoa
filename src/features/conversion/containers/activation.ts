import { ACTIVATION_STEPS, ActivationChecklistSchema, type ActivationChecklist } from "@/lib/contracts/conversion";
import type { DocumentSummary } from "@/lib/contracts/document";

/**
 * Checklist de activación derivado de los documentos reales del usuario
 * (conversion-funnel.md, D4). Puro: no agrega estado de producto.
 * - creado: existe al menos un documento.
 * - verificado: algún documento pasó del borrador (revisión congelada, control evaluado o estado avanzado).
 * - confirmado: alguna revisión tiene todas las confirmaciones (o el documento ya está finalizado).
 * - sellado: alguna huella quedó registrada en Hedera.
 */
export function toActivationChecklist(documents: readonly DocumentSummary[]): ActivationChecklist {
  const done = {
    creado: documents.length > 0,
    verificado: documents.some((d) => d.revisionId !== null || d.controlStatus !== "sin_evaluar" || d.documentStatus !== "borrador"),
    confirmado: documents.some((d) => d.confirmationStatus === "completa" || d.documentStatus === "finalizado"),
    sellado: documents.some((d) => d.hcsStatus === "registrado"),
  };
  const next = [...documents]
    .filter((d) => d.hcsStatus !== "registrado")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0];
  return ActivationChecklistSchema.parse({
    steps: ACTIVATION_STEPS.map((id) => ({ id, done: done[id] })),
    nextDocumentId: next?.id ?? null,
  });
}

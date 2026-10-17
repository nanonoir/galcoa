import "server-only";

import { ReceiptSchema, type Receipt } from "@/lib/contracts/version";
import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";

/**
 * Constancias de confirmación (MVP-081; review-confirmation §«anexo»). Se
 * construyen **después** de las confirmaciones, desde las respuestas
 * persistidas, en orden estable autor → intermediario → comprador. No piden
 * datos nuevos al navegador ni cambian la operación acordada.
 */

const ORDER: ParticipantRole[] = ["autor", "intermediario", "comprador"];

export class ReceiptsError extends Error {
  readonly code = "RECEIPTS_INCOMPLETE";
}

export function buildReceipts(
  selection: ParticipantSelection,
  responses: readonly {
    responseId: string;
    role: ParticipantRole;
    decision: "confirmar" | "rechazar";
    declaredName: string | null;
    respondedAt: string;
  }[],
): Receipt[] {
  const byRole = new Map(responses.map((r) => [r.role, r]));
  if (byRole.size !== responses.length) throw new ReceiptsError("Respuestas duplicadas por rol");
  return ORDER.filter((role) => (selection as readonly ParticipantRole[]).includes(role)).map((role) => {
    const r = byRole.get(role);
    if (!r || r.decision !== "confirmar") throw new ReceiptsError(`Falta la confirmación de ${role}`);
    return ReceiptSchema.parse({
      responseId: r.responseId,
      role,
      declaredName: role === "autor" ? null : r.declaredName,
      respondedAt: r.respondedAt,
    });
  });
}

/** Texto de procedencia del anexo: confirmación por enlace, no verificación de identidad. */
export function receiptsHeadline(receipts: readonly Receipt[]): string {
  return receipts.length === 1
    ? "Declarado por el autor; sin corroboración de terceros."
    : "Confirmado por los participantes seleccionados mediante enlace. Los nombres son autodeclarados.";
}

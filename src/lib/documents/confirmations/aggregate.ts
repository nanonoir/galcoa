import "server-only";

import type { ConfirmationStatus } from "@/lib/contracts/document";
import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";
import { confirmationStatus, provenance, type Provenance } from "@/lib/rules/dimensions";

/**
 * Estado agregado de confirmaciones de una revisión (MVP-075; PRD §5, INV-12/13).
 *
 * Proyección pura sobre el motor de `src/lib/rules/dimensions.ts`: no hay una
 * segunda implementación del agregado. Se atribuye a su `revisionId` y
 * `snapshotId`; una respuesta de otro snapshot no cuenta y un estado nunca se
 * traspasa a otra revisión. La ausencia de advertencias no aprueba nada y una
 * advertencia, aun crítica, no cambia este conteo ni bloquea. Un rechazo
 * impide finalizar esa revisión y deja crear otra, sin herencia.
 */

export type AggregateResponse = {
  role: ParticipantRole;
  response: "confirmado" | "rechazado";
  /** Snapshot sobre el que respondió; el agregado solo cuenta el vigente. */
  snapshotId: string;
};

export type AggregateInput = {
  revisionId: string;
  snapshotId: string;
  selection: ParticipantSelection;
  responses: readonly AggregateResponse[];
  /** Otra revisión la reemplazó. */
  superseded: boolean;
};

export type ConfirmationAggregate = {
  revisionId: string;
  snapshotId: string;
  confirmationStatus: ConfirmationStatus;
  /** Roles seleccionados (siempre incluye al autor). */
  required: number;
  confirmed: number;
  rejected: number;
  missingRoles: ParticipantRole[];
  /** Todas confirmaron el mismo snapshot, ninguna rechazó y la revisión sigue vigente. */
  canFinalize: boolean;
  /** Tras un rechazo o una sustitución se congela otra revisión desde cero. */
  canCreateNewRevision: boolean;
  provenance: Provenance | null;
  summary: string;
};

export function summarize(status: ConfirmationStatus, confirmed: number, required: number): string {
  switch (status) {
    case "rechazada":
      return "Revisión rechazada";
    case "sustituida":
      return "Revisión sustituida: requiere nuevas confirmaciones";
    case "completa":
      return `Confirmaron ${confirmed} de ${required}`;
    default:
      return `Confirmaron ${confirmed} de ${required}. Faltan confirmaciones`;
  }
}

export function computeAggregate(input: AggregateInput): ConfirmationAggregate {
  // Solo cuentan las respuestas del snapshot vigente de esta revisión.
  const responses = input.responses.filter((r) => r.snapshotId === input.snapshotId);
  const status = confirmationStatus({ selection: input.selection, responses, superseded: input.superseded });
  const confirmedRoles = new Set(responses.filter((r) => r.response === "confirmado").map((r) => r.role));
  const required = input.selection.length;
  const confirmed = input.selection.filter((role) => confirmedRoles.has(role)).length;
  const answered = new Set(responses.map((r) => r.role));
  return {
    revisionId: input.revisionId,
    snapshotId: input.snapshotId,
    confirmationStatus: status,
    required,
    confirmed,
    rejected: responses.filter((r) => r.response === "rechazado").length,
    missingRoles: input.selection.filter((role) => !answered.has(role)),
    canFinalize: status === "completa",
    canCreateNewRevision: status === "rechazada" || status === "sustituida",
    provenance: provenance(input.selection, status),
    summary: summarize(status, confirmed, required),
  };
}

import "server-only";

import type { AlcBlockCode, AlcColor } from "@/lib/contracts/alc";
import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";
import { alcBlock } from "@/lib/rules/alc";

/**
 * Máquina de fases de la finalización (MVP-080; data-transactions, migración
 * C3 `finalization_operations`). Pura: sin E/S ni reloj implícito. Refleja las
 * guardas SQL para rechazar antes lo que la base rechazaría: fase monotónica
 * de a un paso, `published` terminal, fencing que no retrocede y reanudar tras
 * abandono solo con fencing nuevo. Ni el cliente ni la IA deciden: la
 * elegibilidad sale de las confirmaciones persistidas del mismo snapshot.
 */

export const PHASES = ["reserved", "pdf_staged", "manifest_ready", "object_checked", "published"] as const;
export type Phase = (typeof PHASES)[number];

export type FinalizationOperation = {
  phase: Phase;
  status: "active" | "abandoned";
  fencing: number;
  /** Instante ISO del vencimiento del lease. */
  leaseExpiresAt: string;
};

export type Eligibility =
  | { ok: true }
  | { ok: false; code: "REVISION_NOT_ACTIVE" | "CONFIRMATION_REJECTED" | "CONFIRMATIONS_MISSING" | "SNAPSHOT_MISMATCH" }
  /** Veredicto ALC: bloquea el sello; `reason` es el código estructurado compartido con SQL. */
  | { ok: false; code: "ALC_BLOCKED"; reason: AlcBlockCode };

/**
 * Se puede reclamar solo con la revisión activa y **todas** las confirmaciones
 * seleccionadas persistidas del mismo snapshot, sin ninguna negativa y con una
 * evaluación ALC vigente que no sea roja (F-1). Las advertencias heredadas del
 * contenido siguen siendo informativas.
 */
export function canClaim(input: {
  revisionActive: boolean;
  snapshotHash: string;
  selection: ParticipantSelection;
  responses: readonly { role: ParticipantRole; snapshotHash: string; decision: "confirmar" | "rechazar" }[];
  /** Evaluación ALC persistida de la revisión; `null` si no existe. */
  alcEvaluation: { color: AlcColor; current: boolean } | null;
}): Eligibility {
  if (!input.revisionActive) return { ok: false, code: "REVISION_NOT_ACTIVE" };
  const reason = alcBlock({ evaluation: input.alcEvaluation, selection: input.selection });
  if (reason) return { ok: false, code: "ALC_BLOCKED", reason };
  if (input.responses.some((r) => r.snapshotHash !== input.snapshotHash)) return { ok: false, code: "SNAPSHOT_MISMATCH" };
  if (input.responses.some((r) => r.decision === "rechazar")) return { ok: false, code: "CONFIRMATION_REJECTED" };
  const confirmed = new Set(input.responses.filter((r) => r.decision === "confirmar").map((r) => r.role));
  return input.selection.every((role) => confirmed.has(role)) ? { ok: true } : { ok: false, code: "CONFIRMATIONS_MISSING" };
}

export type TransitionError =
  | "OPERATION_PUBLISHED"
  | "OPERATION_ABANDONED"
  | "STALE_FENCING"
  | "LEASE_EXPIRED"
  | "PHASE_SKIP"
  | "PHASE_BACKWARDS"
  | "RESUME_NEEDS_NEW_FENCING"
  | "LEASE_ACTIVE";

export type Transition =
  /** Avanzar exactamente una fase, con el fencing vigente y el lease sin vencer. */
  | { type: "advance"; to: Phase; fencing: number; now: string }
  /** Renovar el lease del mismo dueño. */
  | { type: "renew"; fencing: number; now: string; leaseSeconds: number }
  /** Tomar una operación cuyo lease venció o que fue abandonada: fencing nuevo. */
  | { type: "takeover"; now: string; leaseSeconds: number }
  /** Abandono explícito antes de publicar: invalida escrituras tardías. */
  | { type: "abandon"; fencing: number };

const rank = (p: Phase) => PHASES.indexOf(p);
const plus = (now: string, seconds: number) => new Date(Date.parse(now) + seconds * 1000).toISOString();

export function applyTransition(
  op: FinalizationOperation,
  t: Transition,
): { ok: true; op: FinalizationOperation } | { ok: false; error: TransitionError } {
  if (op.phase === "published") return { ok: false, error: "OPERATION_PUBLISHED" };
  const expired = (now: string) => Date.parse(now) >= Date.parse(op.leaseExpiresAt);

  switch (t.type) {
    case "advance": {
      if (op.status === "abandoned") return { ok: false, error: "OPERATION_ABANDONED" };
      if (t.fencing !== op.fencing) return { ok: false, error: "STALE_FENCING" };
      if (expired(t.now)) return { ok: false, error: "LEASE_EXPIRED" };
      const step = rank(t.to) - rank(op.phase);
      if (step < 0) return { ok: false, error: "PHASE_BACKWARDS" };
      if (step !== 1) return step === 0 ? { ok: true, op } : { ok: false, error: "PHASE_SKIP" };
      return { ok: true, op: { ...op, phase: t.to } };
    }
    case "renew": {
      if (op.status === "abandoned") return { ok: false, error: "OPERATION_ABANDONED" };
      if (t.fencing !== op.fencing) return { ok: false, error: "STALE_FENCING" };
      if (expired(t.now)) return { ok: false, error: "LEASE_EXPIRED" };
      return { ok: true, op: { ...op, leaseExpiresAt: plus(t.now, t.leaseSeconds) } };
    }
    case "takeover": {
      if (op.status === "active" && !expired(t.now)) return { ok: false, error: "LEASE_ACTIVE" };
      // La fase no retrocede: el nuevo dueño reanuda desde donde quedó, con fencing mayor.
      return { ok: true, op: { ...op, status: "active", fencing: op.fencing + 1, leaseExpiresAt: plus(t.now, t.leaseSeconds) } };
    }
    case "abandon": {
      if (t.fencing !== op.fencing) return { ok: false, error: "STALE_FENCING" };
      return { ok: true, op: { ...op, status: "abandoned" } };
    }
  }
}

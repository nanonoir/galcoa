import type { ConfirmationStatus, ControlStatus, HcsStatus } from "@/lib/contracts/document";
import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";

/**
 * Motor determinista de estados (MVP-060; PRD §5, INV-02/09; SH-02/03).
 *
 * Funciones puras: sin reloj, red, entorno ni aleatoriedad. Cada dimensión se
 * calcula por separado y ninguna se deriva de otra. Una entrada inválida es un
 * error explícito, nunca un valor por defecto que aparente aprobación.
 */

export class RuleInputError extends Error {
  readonly code = "RULE_INVALID_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "RuleInputError";
  }
}

// ── Control documental ────────────────────────────────────────────────────────

export type ControlInput = {
  /** Revisión del borrador que se está evaluando. */
  draftRevision: number;
  /** Reporte del Agente 2, si existe. Si evaluó otra revisión, está desactualizado y no cuenta. */
  agent2: { draftRevision: number; result: Exclude<ControlStatus, "sin_evaluar"> } | null;
  /** Hallazgos vigentes (Agente 1, Agente 2 y reglas) de **esta** revisión. */
  findings: readonly { severity: "warning" | "critical"; draftRevision: number }[];
  /** Las reglas deterministas corrieron sobre esta revisión. */
  rulesEvaluated: boolean;
};

/**
 * `sin_evaluar` sin reporte vigente ni reglas ejecutadas; si no, precedencia
 * `contradiccion_critica` > `con_advertencias` > `sin_inconsistencias_criticas_detectadas`.
 * La última **solo** con una evaluación hecha, nunca por falta de advertencias.
 */
export function controlStatus(input: ControlInput): ControlStatus {
  if (!Number.isInteger(input.draftRevision) || input.draftRevision < 0) throw new RuleInputError("draftRevision inválida");
  const agent2 = input.agent2 && input.agent2.draftRevision === input.draftRevision ? input.agent2 : null;
  const findings = input.findings.filter((f) => f.draftRevision === input.draftRevision);
  if (!agent2 && !input.rulesEvaluated) return "sin_evaluar";
  if (agent2?.result === "contradiccion_critica" || findings.some((f) => f.severity === "critical")) return "contradiccion_critica";
  if (agent2?.result === "con_advertencias" || findings.length > 0) return "con_advertencias";
  return "sin_inconsistencias_criticas_detectadas";
}

// ── Confirmaciones ────────────────────────────────────────────────────────────

export type ConfirmationInput = {
  selection: ParticipantSelection;
  /** Respuestas de **esta** revisión y snapshot; una por rol como máximo. */
  responses: readonly { role: ParticipantRole; response: "confirmado" | "rechazado" }[];
  /** La revisión fue sustituida por otra. */
  superseded: boolean;
};

export function confirmationStatus(input: ConfirmationInput): ConfirmationStatus {
  const selected = new Set<ParticipantRole>(input.selection);
  if (!selected.has("autor")) throw new RuleInputError("La selección siempre incluye al autor");
  const seen = new Set<ParticipantRole>();
  for (const r of input.responses) {
    if (!selected.has(r.role)) throw new RuleInputError(`Respuesta de un rol no seleccionado: ${r.role}`);
    if (seen.has(r.role)) throw new RuleInputError(`Respuesta duplicada: ${r.role}`);
    seen.add(r.role);
  }
  if (input.superseded) return "sustituida";
  if (input.responses.some((r) => r.response === "rechazado")) return "rechazada";
  const confirmed = input.responses.filter((r) => r.response === "confirmado").length;
  if (confirmed === selected.size) return "completa";
  return confirmed === 0 ? "pendiente" : "parcial";
}

// ── Procedencia ───────────────────────────────────────────────────────────────

export type Provenance = "declarado_por_autor" | "declarado_y_corroborado_por_tercero";

/**
 * Solo autor y confirmación completa → declarado por el autor; con terceros,
 * corroborado solo cuando **todos** confirmaron. Antes de eso no hay
 * procedencia final (`null`), para no adelantar una corroboración.
 */
export function provenance(selection: ParticipantSelection, status: ConfirmationStatus): Provenance | null {
  if (status !== "completa") return null;
  return selection.length > 1 ? "declarado_y_corroborado_por_tercero" : "declarado_por_autor";
}

// ── Sello HCS ─────────────────────────────────────────────────────────────────

export type SealInput = {
  /** Existe una versión finalizada. */
  finalizedVersion: boolean;
  /** Registro comprobado contra la red (transacción y consenso verificados). */
  provenRegistration: boolean;
};

/**
 * `fallido` describe un **intento** (historial aparte), no el agregado: sin
 * registro probado la versión finalizada sigue `pendiente`.
 */
export function hcsStatus(input: SealInput): HcsStatus {
  if (!input.finalizedVersion) {
    if (input.provenRegistration) throw new RuleInputError("Registro sin versión finalizada");
    return "no_iniciado";
  }
  return input.provenRegistration ? "registrado" : "pendiente";
}
